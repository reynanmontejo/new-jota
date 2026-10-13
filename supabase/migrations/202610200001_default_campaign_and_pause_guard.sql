begin;

-- Keep the database's required campaign relationship, but create a sensible
-- per-client bucket automatically when content is added without a campaign.
create or replace function public.ensure_default_campaign_for_current_user(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  default_campaign_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('content.create') then
    raise exception 'Content creation is not permitted' using errcode = '42501';
  end if;
  if not private.can_access_client(p_client_id) or exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.organization_id = org_id and (c.deleted_at is not null or c.status = 'archived')
  ) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || p_client_id::text || ':default-content-campaign', 0));
  select c.id into default_campaign_id
  from public.campaigns c
  where c.organization_id = org_id and c.client_id = p_client_id and c.deleted_at is null
    and lower(trim(c.name)) = 'general / ongoing' and c.status in ('draft', 'active')
  order by c.created_at, c.id
  limit 1;
  if default_campaign_id is not null then return default_campaign_id; end if;

  if exists (
    select 1 from public.campaigns c
    where c.organization_id = org_id and c.client_id = p_client_id and c.deleted_at is null
      and lower(trim(c.name)) = 'general / ongoing' and c.status not in ('draft', 'active')
  ) then
    raise exception 'The General / Ongoing campaign is paused or closed. Reopen it before adding content.' using errcode = '22023';
  end if;

  insert into public.campaigns (organization_id, client_id, name, description, status, created_by)
  values (org_id, p_client_id, 'General / Ongoing', 'Default grouping for content that is not part of a named campaign.', 'active', actor_id)
  returning id into default_campaign_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'campaign', default_campaign_id, 'CAMPAIGN_CREATED',
    jsonb_build_object('name', 'General / Ongoing', 'client_id', p_client_id, 'system_default', true));
  return default_campaign_id;
end;
$$;

revoke all on function public.ensure_default_campaign_for_current_user(uuid) from public, anon;
grant execute on function public.ensure_default_campaign_for_current_user(uuid) to authenticated;

-- Paused campaigns remain readable and their existing content can still be
-- edited. They cannot receive new content or be selected for a campaign change.
create or replace function private.guard_content_campaign_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_status public.campaign_status;
begin
  if tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id then
    select c.status into campaign_status
    from public.campaigns c
    where c.id = new.campaign_id
      and c.organization_id = new.organization_id
      and c.client_id = new.client_id
      and c.deleted_at is null;

    if campaign_status is null or campaign_status not in ('draft', 'active') then
      raise exception 'Choose a draft or active campaign. Paused or closed campaigns cannot receive new content.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_campaign_active_guard on public.content_items;
create trigger content_items_campaign_active_guard
before insert or update of campaign_id on public.content_items
for each row execute function private.guard_content_campaign_active();

commit;

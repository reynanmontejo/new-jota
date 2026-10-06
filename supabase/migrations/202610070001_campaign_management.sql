begin;

create or replace function public.create_campaign_for_current_user(
  p_client_id uuid,
  p_name text,
  p_description text,
  p_status public.campaign_status,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  campaign_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('campaigns.create') then
    raise exception 'Campaign creation is not permitted' using errcode = '42501';
  end if;
  if not private.can_access_client(p_client_id) or exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.organization_id = org_id and c.status = 'archived'
  ) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 160
    or char_length(coalesce(p_description, '')) > 5000
    or (p_start_date is not null and p_end_date is not null and p_end_date < p_start_date)
  then raise exception 'Invalid campaign details' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || p_client_id::text || ':campaign-name', 0));
  if exists (
    select 1 from public.campaigns c
    where c.organization_id = org_id and c.client_id = p_client_id and c.deleted_at is null
      and lower(trim(c.name)) = lower(trim(p_name))
  ) then raise exception 'An active campaign with this name already exists for the client' using errcode = '23505'; end if;

  insert into public.campaigns (organization_id, client_id, name, description, status, start_date, end_date, created_by)
  values (org_id, p_client_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_status, p_start_date, p_end_date, actor_id)
  returning id into campaign_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'campaign', campaign_id, 'CAMPAIGN_CREATED', jsonb_build_object('name', trim(p_name), 'client_id', p_client_id));
  return campaign_id;
end;
$$;

create or replace function public.update_campaign_for_current_user(
  p_campaign_id uuid,
  p_name text,
  p_description text,
  p_status public.campaign_status,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  old_row public.campaigns%rowtype;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('campaigns.update') then
    raise exception 'Campaign editing is not permitted' using errcode = '42501';
  end if;
  select * into old_row from public.campaigns c
  where c.id = p_campaign_id and c.organization_id = org_id and c.deleted_at is null
  for update;
  if not found or not private.can_access_client(old_row.client_id) then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 160
    or char_length(coalesce(p_description, '')) > 5000
    or (p_start_date is not null and p_end_date is not null and p_end_date < p_start_date)
  then raise exception 'Invalid campaign details' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':' || old_row.client_id::text || ':campaign-name', 0));
  if exists (
    select 1 from public.campaigns c
    where c.organization_id = org_id and c.client_id = old_row.client_id and c.deleted_at is null
      and c.id <> p_campaign_id and lower(trim(c.name)) = lower(trim(p_name))
  ) then raise exception 'An active campaign with this name already exists for the client' using errcode = '23505'; end if;

  update public.campaigns set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
    status = p_status, start_date = p_start_date, end_date = p_end_date
  where id = p_campaign_id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'campaign', p_campaign_id, 'CAMPAIGN_UPDATED', jsonb_build_object('name', trim(p_name), 'status', p_status));
end;
$$;

create or replace function public.archive_campaign_for_current_user(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  target_client uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('campaigns.delete') then
    raise exception 'Campaign archiving is not permitted' using errcode = '42501';
  end if;
  select client_id into target_client from public.campaigns
  where id = p_campaign_id and organization_id = org_id and deleted_at is null for update;
  if not found or not private.can_access_client(target_client) then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  update public.campaigns set deleted_at = now() where id = p_campaign_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'campaign', p_campaign_id, 'CAMPAIGN_ARCHIVED');
end;
$$;

revoke all on function public.create_campaign_for_current_user(uuid,text,text,public.campaign_status,date,date) from public, anon;
revoke all on function public.update_campaign_for_current_user(uuid,text,text,public.campaign_status,date,date) from public, anon;
revoke all on function public.archive_campaign_for_current_user(uuid) from public, anon;
grant execute on function public.create_campaign_for_current_user(uuid,text,text,public.campaign_status,date,date) to authenticated;
grant execute on function public.update_campaign_for_current_user(uuid,text,text,public.campaign_status,date,date) to authenticated;
grant execute on function public.archive_campaign_for_current_user(uuid) to authenticated;

commit;

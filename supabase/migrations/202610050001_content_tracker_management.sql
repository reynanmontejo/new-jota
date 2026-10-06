begin;

alter table public.content_items
  add column if not exists revision_count integer not null default 0 check (revision_count >= 0),
  add column if not exists revision_notes text,
  add column if not exists next_action text,
  add column if not exists assigned_to uuid references public.profiles(id) on delete restrict;

create policy profiles_read_client_collaborators on public.profiles for select to authenticated
  using (
    organization_id = (select private.current_organization_id())
    and exists (
      select 1 from public.client_members viewer
      join public.client_members teammate
        on teammate.organization_id = viewer.organization_id
        and teammate.client_id = viewer.client_id
        and teammate.removed_at is null
      where viewer.user_id = (select auth.uid())
        and viewer.removed_at is null
        and teammate.user_id = profiles.id
        and private.can_access_client(viewer.client_id)
    )
  );

create or replace function public.create_content_item_for_current_user(
  p_client_id uuid,
  p_campaign_id uuid,
  p_title text,
  p_platform text,
  p_content_type text,
  p_description text,
  p_status public.content_status,
  p_publish_at timestamptz,
  p_next_action text,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  new_content_id uuid;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.create') then raise exception 'Content creation is not permitted' using errcode = '42501'; end if;
  if not private.can_access_client(p_client_id) then raise exception 'Client access is not permitted' using errcode = '42501'; end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.client_id = p_client_id and c.organization_id = org_id and c.deleted_at is null) then
    raise exception 'Choose a campaign belonging to this client' using errcode = '22023';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.client_members cm join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = p_client_id and cm.user_id = p_assigned_to
      and cm.removed_at is null and p.status = 'active' and p.deactivated_at is null
  ) then raise exception 'Choose an active member assigned to this client' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 200
    or char_length(trim(coalesce(p_platform, ''))) not between 2 and 60
    or char_length(trim(coalesce(p_content_type, ''))) not between 2 and 80
    or char_length(coalesce(p_description, '')) > 5000
    or char_length(coalesce(p_next_action, '')) > 500
  then raise exception 'Invalid content details' using errcode = '22023'; end if;

  insert into public.content_items (organization_id, client_id, campaign_id, title, platform, content_type, description, status, publish_at, next_action, assigned_to, created_by)
  values (org_id, p_client_id, p_campaign_id, trim(p_title), trim(p_platform), trim(p_content_type), nullif(trim(coalesce(p_description, '')), ''), p_status, p_publish_at, nullif(trim(coalesce(p_next_action, '')), ''), p_assigned_to, actor_id)
  returning id into new_content_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', new_content_id, 'CONTENT_CREATED', jsonb_build_object('title', trim(p_title), 'status', p_status));
  return new_content_id;
end;
$$;

create or replace function public.update_content_item_for_current_user(
  p_content_id uuid,
  p_client_id uuid,
  p_campaign_id uuid,
  p_title text,
  p_platform text,
  p_content_type text,
  p_description text,
  p_status public.content_status,
  p_publish_at timestamptz,
  p_next_action text,
  p_revision_notes text,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  old_row public.content_items%rowtype;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.update') then raise exception 'Content editing is not permitted' using errcode = '42501'; end if;
  select * into old_row from public.content_items ci where ci.id = p_content_id and ci.organization_id = org_id and ci.deleted_at is null for update;
  if not found or not private.can_access_client(old_row.client_id) then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  if p_client_id <> old_row.client_id or not private.can_access_client(p_client_id) then raise exception 'Moving content to another client is not permitted' using errcode = '42501'; end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.client_id = p_client_id and c.organization_id = org_id and c.deleted_at is null) then
    raise exception 'Choose a campaign belonging to this client' using errcode = '22023';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.client_members cm join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = p_client_id and cm.user_id = p_assigned_to
      and cm.removed_at is null and p.status = 'active' and p.deactivated_at is null
  ) then raise exception 'Choose an active member assigned to this client' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 200
    or char_length(trim(coalesce(p_platform, ''))) not between 2 and 60
    or char_length(trim(coalesce(p_content_type, ''))) not between 2 and 80
    or char_length(coalesce(p_description, '')) > 5000
    or char_length(coalesce(p_next_action, '')) > 500
    or char_length(coalesce(p_revision_notes, '')) > 5000
  then raise exception 'Invalid content details' using errcode = '22023'; end if;

  update public.content_items set campaign_id = p_campaign_id, title = trim(p_title), platform = trim(p_platform), content_type = trim(p_content_type),
    description = nullif(trim(coalesce(p_description, '')), ''), status = p_status, publish_at = p_publish_at,
    next_action = nullif(trim(coalesce(p_next_action, '')), ''),
    assigned_to = p_assigned_to,
    revision_count = revision_count + case when nullif(trim(coalesce(p_revision_notes, '')), '') is not null and nullif(trim(coalesce(p_revision_notes, '')), '') is distinct from old_row.revision_notes then 1 else 0 end,
    revision_notes = nullif(trim(coalesce(p_revision_notes, '')), '')
  where id = p_content_id and organization_id = org_id;

  if old_row.status is distinct from p_status then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_STATUS_CHANGED', jsonb_build_object('from', old_row.status, 'to', p_status));
  end if;
end;
$$;

create or replace function public.archive_content_item_for_current_user(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id(); target_client uuid;
begin
  if actor_id is null or org_id is null or not private.has_permission('content.update') then raise exception 'Content archiving is not permitted' using errcode = '42501'; end if;
  select client_id into target_client from public.content_items where id = p_content_id and organization_id = org_id and deleted_at is null for update;
  if not found or not private.can_access_client(target_client) then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  update public.content_items set deleted_at = now() where id = p_content_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_ARCHIVED');
end;
$$;

revoke all on function public.create_content_item_for_current_user(uuid, uuid, text, text, text, text, public.content_status, timestamptz, text, uuid) from public, anon;
revoke all on function public.update_content_item_for_current_user(uuid, uuid, uuid, text, text, text, text, public.content_status, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.archive_content_item_for_current_user(uuid) from public, anon;
grant execute on function public.create_content_item_for_current_user(uuid, uuid, text, text, text, text, public.content_status, timestamptz, text, uuid) to authenticated;
grant execute on function public.update_content_item_for_current_user(uuid, uuid, uuid, text, text, text, text, public.content_status, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.archive_content_item_for_current_user(uuid) to authenticated;

commit;

begin;

-- Preserve the workbook's production, deadline, publishing, approval, issue,
-- revision and notes columns as distinct data instead of overloading fields.
alter type public.content_status add value if not exists 'for_review';
alter type public.content_status add value if not exists 'revision_requested';
alter type public.content_status add value if not exists 'waiting_client';
alter type public.content_status add value if not exists 'rejected';

alter table public.content_items
  add column if not exists work_date date,
  add column if not exists deadline_at date,
  add column if not exists client_approval_status text
    check (client_approval_status in ('pending', 'approved', 'revision_requested', 'rejected')),
  add column if not exists client_issues text,
  add column if not exists notes text;

create index if not exists content_items_deadline_idx
  on public.content_items (organization_id, deadline_at) where deleted_at is null;

create or replace function public.create_content_tracker_item_for_current_user(
  p_client_id uuid,
  p_campaign_id uuid,
  p_title text,
  p_platform text,
  p_content_type text,
  p_description text,
  p_status public.content_status,
  p_work_date date,
  p_deadline_at date,
  p_publish_at timestamptz,
  p_client_approval_status text,
  p_client_issues text,
  p_notes text,
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
  if p_client_approval_status is not null and p_client_approval_status not in ('pending', 'approved', 'revision_requested', 'rejected') then
    raise exception 'Invalid client approval status' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 200
    or char_length(trim(coalesce(p_platform, ''))) not between 2 and 60
    or char_length(trim(coalesce(p_content_type, ''))) not between 2 and 80
    or char_length(coalesce(p_description, '')) > 5000
    or char_length(coalesce(p_client_issues, '')) > 5000
    or char_length(coalesce(p_notes, '')) > 5000
    or char_length(coalesce(p_next_action, '')) > 500
  then raise exception 'Invalid content details' using errcode = '22023'; end if;

  insert into public.content_items (
    organization_id, client_id, campaign_id, title, platform, content_type,
    description, status, work_date, deadline_at, publish_at,
    client_approval_status, client_issues, notes, next_action, assigned_to, created_by
  ) values (
    org_id, p_client_id, p_campaign_id, trim(p_title), trim(p_platform), trim(p_content_type),
    nullif(trim(coalesce(p_description, '')), ''), p_status, p_work_date, p_deadline_at, p_publish_at,
    p_client_approval_status, nullif(trim(coalesce(p_client_issues, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), nullif(trim(coalesce(p_next_action, '')), ''), p_assigned_to, actor_id
  ) returning id into new_content_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', new_content_id, 'CONTENT_CREATED', jsonb_build_object('title', trim(p_title), 'status', p_status));
  return new_content_id;
end;
$$;

create or replace function public.update_content_tracker_item_for_current_user(
  p_content_id uuid,
  p_client_id uuid,
  p_campaign_id uuid,
  p_title text,
  p_platform text,
  p_content_type text,
  p_description text,
  p_status public.content_status,
  p_work_date date,
  p_deadline_at date,
  p_publish_at timestamptz,
  p_client_approval_status text,
  p_client_issues text,
  p_notes text,
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
  clean_revision_notes text := nullif(trim(coalesce(p_revision_notes, '')), '');
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
  if p_client_approval_status is not null and p_client_approval_status not in ('pending', 'approved', 'revision_requested', 'rejected') then
    raise exception 'Invalid client approval status' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 200
    or char_length(trim(coalesce(p_platform, ''))) not between 2 and 60
    or char_length(trim(coalesce(p_content_type, ''))) not between 2 and 80
    or char_length(coalesce(p_description, '')) > 5000
    or char_length(coalesce(p_client_issues, '')) > 5000
    or char_length(coalesce(p_notes, '')) > 5000
    or char_length(coalesce(p_next_action, '')) > 500
    or char_length(coalesce(p_revision_notes, '')) > 5000
  then raise exception 'Invalid content details' using errcode = '22023'; end if;

  update public.content_items set
    campaign_id = p_campaign_id, title = trim(p_title), platform = trim(p_platform), content_type = trim(p_content_type),
    description = nullif(trim(coalesce(p_description, '')), ''), status = p_status,
    work_date = p_work_date, deadline_at = p_deadline_at, publish_at = p_publish_at,
    client_approval_status = p_client_approval_status,
    client_issues = nullif(trim(coalesce(p_client_issues, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    next_action = nullif(trim(coalesce(p_next_action, '')), ''), assigned_to = p_assigned_to,
    revision_count = revision_count + case when clean_revision_notes is not null and clean_revision_notes is distinct from old_row.revision_notes then 1 else 0 end,
    revision_notes = clean_revision_notes
  where id = p_content_id and organization_id = org_id;

  if old_row.status is distinct from p_status then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_STATUS_CHANGED', jsonb_build_object('from', old_row.status, 'to', p_status));
  end if;
  if old_row.client_approval_status is distinct from p_client_approval_status then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_CLIENT_APPROVAL_CHANGED', jsonb_build_object('from', old_row.client_approval_status, 'to', p_client_approval_status));
  end if;
end;
$$;

create or replace function public.import_content_items_for_current_user(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  row_item jsonb;
  v_client_id uuid;
  v_campaign_id uuid;
  v_assigned_to uuid;
  item_title text;
  item_platform text;
  item_type text;
  item_status public.content_status;
  item_work_date date;
  item_deadline_at date;
  item_publish_at timestamptz;
  item_approval text;
  item_description text;
  item_client_issues text;
  item_notes text;
  item_next_action text;
  item_revision_notes text;
  item_revision_count integer;
  content_id uuid;
  created_count integer := 0;
  duplicate_count integer := 0;
  row_index integer := 0;
  row_key text;
  seen_keys text[] := array[]::text[];
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.create') then raise exception 'Content import is not permitted' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 250 then
    raise exception 'Import must contain between 1 and 250 rows' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':content-csv-import', 0));
  for row_item in select value from jsonb_array_elements(p_rows) loop
    row_index := row_index + 1;
    begin
      v_client_id := nullif(row_item->>'client_id', '')::uuid;
      v_campaign_id := nullif(row_item->>'campaign_id', '')::uuid;
      v_assigned_to := nullif(row_item->>'assigned_to', '')::uuid;
      item_title := trim(coalesce(row_item->>'title', ''));
      item_platform := trim(coalesce(row_item->>'platform', ''));
      item_type := trim(coalesce(row_item->>'content_type', ''));
      item_status := coalesce(nullif(row_item->>'status', '')::public.content_status, 'planned');
      item_work_date := nullif(row_item->>'work_date', '')::date;
      item_deadline_at := nullif(row_item->>'deadline_at', '')::date;
      item_publish_at := nullif(row_item->>'publish_at', '')::timestamptz;
      item_approval := nullif(row_item->>'client_approval_status', '');
      item_description := nullif(trim(coalesce(row_item->>'description', '')), '');
      item_client_issues := nullif(trim(coalesce(row_item->>'client_issues', '')), '');
      item_notes := nullif(trim(coalesce(row_item->>'notes', '')), '');
      item_next_action := nullif(trim(coalesce(row_item->>'next_action', '')), '');
      item_revision_notes := nullif(trim(coalesce(row_item->>'revision_notes', '')), '');
      item_revision_count := coalesce(nullif(row_item->>'revision_count', '')::integer, 0);
    exception when others then
      raise exception 'Row % contains an invalid identifier, status, date, or revision count', row_index using errcode = '22023';
    end;

    if not private.can_access_client(v_client_id) then raise exception 'Row % references a client you cannot access', row_index using errcode = '42501'; end if;
    if not exists (select 1 from public.campaigns c where c.id = v_campaign_id and c.client_id = v_client_id and c.organization_id = org_id and c.deleted_at is null) then
      raise exception 'Row % campaign does not belong to its client or is inactive', row_index using errcode = '22023';
    end if;
    if v_assigned_to is not null and not exists (
      select 1 from public.client_members cm join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
      where cm.organization_id = org_id and cm.client_id = v_client_id and cm.user_id = v_assigned_to
        and cm.removed_at is null and p.status = 'active' and p.deactivated_at is null
    ) then raise exception 'Row % assignee is not an active member of its client', row_index using errcode = '22023'; end if;
    if item_approval is not null and item_approval not in ('pending', 'approved', 'revision_requested', 'rejected') then
      raise exception 'Row % has an invalid client approval value', row_index using errcode = '22023';
    end if;
    if char_length(item_title) not between 2 and 200 or char_length(item_platform) not between 2 and 60
      or char_length(item_type) not between 2 and 80 or char_length(coalesce(item_description, '')) > 5000
      or char_length(coalesce(item_client_issues, '')) > 5000 or char_length(coalesce(item_notes, '')) > 5000
      or char_length(coalesce(item_next_action, '')) > 500 or char_length(coalesce(item_revision_notes, '')) > 5000
      or item_revision_count not between 0 and 10000
    then raise exception 'Row % has invalid or oversized content fields', row_index using errcode = '22023'; end if;

    row_key := v_client_id::text || '|' || v_campaign_id::text || '|' || lower(item_title) || '|' || lower(item_platform) || '|' || coalesce(item_publish_at::text, '');
    if row_key = any(seen_keys) or exists (
      select 1 from public.content_items ci where ci.organization_id = org_id and ci.deleted_at is null
        and ci.client_id = v_client_id and ci.campaign_id = v_campaign_id
        and lower(ci.title) = lower(item_title) and lower(ci.platform) = lower(item_platform)
        and ci.publish_at is not distinct from item_publish_at
    ) then
      duplicate_count := duplicate_count + 1;
      seen_keys := array_append(seen_keys, row_key);
      continue;
    end if;

    insert into public.content_items (
      organization_id, client_id, campaign_id, title, platform, content_type, description, status,
      work_date, deadline_at, publish_at, client_approval_status, client_issues, notes,
      revision_count, revision_notes, next_action, assigned_to, created_by
    ) values (
      org_id, v_client_id, v_campaign_id, item_title, item_platform, item_type, item_description, item_status,
      item_work_date, item_deadline_at, item_publish_at, item_approval, item_client_issues, item_notes,
      item_revision_count, item_revision_notes, item_next_action, v_assigned_to, actor_id
    ) returning id into content_id;
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'content_item', content_id, 'CONTENT_IMPORTED', jsonb_build_object('title', item_title, 'status', item_status, 'row', row_index));

    created_count := created_count + 1;
    seen_keys := array_append(seen_keys, row_key);
  end loop;

  return jsonb_build_object('created', created_count, 'duplicates', duplicate_count);
end;
$$;

revoke all on function public.create_content_tracker_item_for_current_user(uuid, uuid, text, text, text, text, public.content_status, date, date, timestamptz, text, text, text, text, uuid) from public, anon;
revoke all on function public.update_content_tracker_item_for_current_user(uuid, uuid, uuid, text, text, text, text, public.content_status, date, date, timestamptz, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.import_content_items_for_current_user(jsonb) from public, anon;
grant execute on function public.create_content_tracker_item_for_current_user(uuid, uuid, text, text, text, text, public.content_status, date, date, timestamptz, text, text, text, text, uuid) to authenticated;
grant execute on function public.update_content_tracker_item_for_current_user(uuid, uuid, uuid, text, text, text, text, public.content_status, date, date, timestamptz, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.import_content_items_for_current_user(jsonb) to authenticated;

commit;

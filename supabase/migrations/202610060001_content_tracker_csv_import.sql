begin;

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
  item_publish_at timestamptz;
  item_description text;
  item_next_action text;
  item_revision_notes text;
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
      item_publish_at := nullif(row_item->>'publish_at', '')::timestamptz;
      item_description := nullif(trim(coalesce(row_item->>'description', '')), '');
      item_next_action := nullif(trim(coalesce(row_item->>'next_action', '')), '');
      item_revision_notes := nullif(trim(coalesce(row_item->>'revision_notes', '')), '');
    exception when others then
      raise exception 'Row % contains an invalid identifier, status, or publish date', row_index using errcode = '22023';
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
    if char_length(item_title) not between 2 and 200 or char_length(item_platform) not between 2 and 60
      or char_length(item_type) not between 2 and 80 or char_length(coalesce(item_description, '')) > 5000
      or char_length(coalesce(item_next_action, '')) > 500 or char_length(coalesce(item_revision_notes, '')) > 5000
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

    insert into public.content_items (organization_id, client_id, campaign_id, title, platform, content_type, description, status, publish_at, next_action, revision_notes, assigned_to, created_by)
    values (org_id, v_client_id, v_campaign_id, item_title, item_platform, item_type, item_description, item_status, item_publish_at, item_next_action, item_revision_notes, v_assigned_to, actor_id)
    returning id into content_id;
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'content_item', content_id, 'CONTENT_IMPORTED', jsonb_build_object('title', item_title, 'status', item_status, 'row', row_index));

    created_count := created_count + 1;
    seen_keys := array_append(seen_keys, row_key);
  end loop;

  return jsonb_build_object('created', created_count, 'duplicates', duplicate_count);
end;
$$;

revoke all on function public.import_content_items_for_current_user(jsonb) from public, anon;
grant execute on function public.import_content_items_for_current_user(jsonb) to authenticated;

commit;

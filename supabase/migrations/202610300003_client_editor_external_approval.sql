begin;

-- Content approval from a client is an external decision, not the same as
-- Jota's supervisor review. Keep the external decision in its own fields and
-- record it through the dedicated RPC below.
create or replace function private.guard_external_client_decision_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.client_approval_status is distinct from old.client_approval_status
      or new.client_issues is distinct from old.client_issues)
    and pg_catalog.current_setting('jota.external_client_decision_write', true) is distinct from 'on' then
    raise exception 'Record client approval through the external client decision workflow' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_external_client_decision_write() from public, anon, authenticated;
drop trigger if exists content_items_guard_external_client_decision on public.content_items;
create trigger content_items_guard_external_client_decision
  before update of client_approval_status, client_issues on public.content_items
  for each row execute function private.guard_external_client_decision_write();

create or replace function public.workflow_list_client_video_editor_candidates(p_client_id uuid)
returns table(user_id uuid, display_name text, job_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  actor_manages_client boolean;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.can_access_client(p_client_id) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is null and c.status <> 'archived'
  ) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.client_members cm
    where cm.organization_id = org_id and cm.client_id = p_client_id
      and cm.user_id = actor_id and cm.client_role = 'account_manager' and cm.removed_at is null
  ) into actor_manages_client;

  if not (private.has_permission('clients.assign') or actor_manages_client) then
    raise exception 'You do not have permission to manage this client video editor' using errcode = '42501';
  end if;

  return query
  select distinct p.id, p.display_name::text, p.job_title
  from public.profiles p
  join public.user_roles ur on ur.organization_id = p.organization_id and ur.user_id = p.id
  join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
  where p.organization_id = org_id and p.status = 'active' and p.deactivated_at is null
    and r.code not in ('administrator', 'supervisor')
    and not exists (
      select 1 from public.user_roles senior_ur
      join public.roles senior_role on senior_role.organization_id = senior_ur.organization_id and senior_role.id = senior_ur.role_id
      where senior_ur.organization_id = org_id and senior_ur.user_id = p.id
        and senior_role.code in ('administrator', 'supervisor')
    )
  order by p.display_name::text;
end;
$$;

revoke all on function public.workflow_list_client_video_editor_candidates(uuid) from public, anon;
grant execute on function public.workflow_list_client_video_editor_candidates(uuid) to authenticated;

create or replace function public.set_client_video_editor(p_client_id uuid, p_video_editor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  actor_manages_client boolean;
  previous_editor_ids uuid[] := array[]::uuid[];
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.client_members cm
    where cm.organization_id = org_id and cm.client_id = p_client_id
      and cm.user_id = actor_id and cm.client_role = 'account_manager' and cm.removed_at is null
  ) into actor_manages_client;
  if not private.has_permission('clients.assign') and not actor_manages_client then
    raise exception 'You do not have permission to manage this client video editor' using errcode = '42501';
  end if;

  perform 1 from public.clients c
  where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is null
  for update;
  if not found or not private.can_access_client(p_client_id) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.clients c where c.id = p_client_id and c.status = 'archived') then
    raise exception 'Archived clients cannot be assigned a Video Editor' using errcode = '22023';
  end if;

  if p_video_editor_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_video_editor_id and p.organization_id = org_id
      and p.status = 'active' and p.deactivated_at is null
      and exists (
        select 1 from public.user_roles ur
        join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
        where ur.organization_id = org_id and ur.user_id = p.id
          and r.code not in ('administrator', 'supervisor')
      )
      and not exists (
        select 1 from public.user_roles ur
        join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
        where ur.organization_id = org_id and ur.user_id = p.id
          and r.code in ('administrator', 'supervisor')
      )
  ) then
    raise exception 'Choose an active non-supervisory employee in this organization' using errcode = '22023';
  end if;

  select coalesce(array_agg(cm.user_id order by cm.assigned_at, cm.user_id), array[]::uuid[])
    into previous_editor_ids
  from public.client_members cm
  where cm.organization_id = org_id and cm.client_id = p_client_id
    and cm.client_role = 'video_editor' and cm.removed_at is null;

  if (cardinality(previous_editor_ids) = 0 and p_video_editor_id is null)
    or (cardinality(previous_editor_ids) = 1 and previous_editor_ids[1] = p_video_editor_id) then
    return;
  end if;

  update public.client_members
  set removed_at = now(), is_primary = false
  where organization_id = org_id and client_id = p_client_id
    and client_role = 'video_editor' and removed_at is null;

  if p_video_editor_id is not null then
    insert into public.client_members (
      organization_id, client_id, user_id, client_role, is_primary, assigned_by, assigned_at, removed_at
    ) values (
      org_id, p_client_id, p_video_editor_id, 'video_editor', false, actor_id, now(), null
    )
    on conflict (client_id, user_id, client_role) do update
      set is_primary = false, assigned_by = excluded.assigned_by,
          assigned_at = excluded.assigned_at, removed_at = null;
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'client', p_client_id, 'CLIENT_VIDEO_EDITOR_CHANGED',
    jsonb_build_object('from_user_ids', previous_editor_ids, 'to_user_id', p_video_editor_id));
end;
$$;

revoke all on function public.set_client_video_editor(uuid, uuid) from public, anon;
grant execute on function public.set_client_video_editor(uuid, uuid) to authenticated;

create or replace function public.record_external_client_decision(
  p_content_item_id uuid,
  p_decision text,
  p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  task_row public.tasks%rowtype;
  feedback text := nullif(trim(coalesce(p_feedback, '')), '');
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('content.update') then
    raise exception 'Content editing is not permitted' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('pending', 'approved', 'revision_requested', 'rejected')
    or char_length(coalesce(feedback, '')) > 5000
    or (p_decision = 'revision_requested' and feedback is null) then
    raise exception 'Choose a valid client decision and include feedback for a revision request' using errcode = '22023';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('jota.external_client_decision_write', 'on', true);
  update public.content_items set
    client_approval_status = p_decision,
    client_issues = case when p_decision in ('revision_requested', 'rejected') then feedback else null end,
    revision_count = revision_count + case when p_decision = 'revision_requested' then 1 else 0 end,
    next_action = case when p_decision = 'revision_requested' then 'Address client revisions' else next_action end,
    updated_at = now()
  where id = item_row.id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id, 'CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED',
    jsonb_build_object('from', item_row.client_approval_status, 'to', p_decision,
      'feedback', feedback, 'decision_source', 'external_channel'));

  if p_decision = 'revision_requested' then
    for task_row in
      select t.* from public.tasks t
      where t.organization_id = org_id and t.content_item_id = item_row.id
        and t.deleted_at is null and t.archived_at is null and t.status <> 'cancelled'
      order by t.id
      for update
    loop
      if task_row.status is distinct from 'todo'::public.task_status or task_row.completed_at is not null then
        update public.tasks set status = 'todo', completed_at = null, updated_at = now()
        where id = task_row.id and organization_id = org_id;
        insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
        values (org_id, actor_id, 'task', task_row.id, 'TASK_RETURNED_FOR_CLIENT_REVISION',
          jsonb_build_object('from', task_row.status, 'to', 'todo', 'content_item_id', item_row.id, 'feedback', feedback));
      end if;

      update public.submissions set status = 'revision_requested', approved_at = null, updated_at = now()
      where organization_id = org_id and task_id = task_row.id
        and status in ('submitted', 'approved', 'revision_requested');
    end loop;
  end if;
end;
$$;

revoke all on function public.record_external_client_decision(uuid, text, text) from public, anon;
grant execute on function public.record_external_client_decision(uuid, text, text) to authenticated;

-- Content decision changes must be published too; task/submission tables are
-- already included in the existing migration.
-- PGLITE_SKIP_START
do $$
declare
  table_name text;
  workflow_tables text[] := array['content_items', 'content_submissions', 'content_submission_versions', 'content_reviews'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is unavailable';
  end if;

  foreach table_name in array workflow_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
-- PGLITE_SKIP_END

commit;

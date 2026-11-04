begin;

alter table public.tasks add column if not exists requires_review boolean not null default false;
update public.tasks t set requires_review = true
from public.content_items ci where ci.id = t.content_item_id
  and not t.requires_review;

create unique index if not exists client_members_one_video_backup
  on public.client_members(client_id) where client_role = 'video_backup' and removed_at is null;

-- Replacing a client default must not strand the former editor's active work.
-- Keep the same client access they had while they remain its assigned producer.
create or replace function private.can_access_client(target_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c where c.id = $1
      and c.organization_id = private.current_organization_id() and c.deleted_at is null
      and (private.has_permission('clients.view_all') or exists (
        select 1 from public.client_members cm where cm.client_id = c.id and cm.organization_id = c.organization_id
          and cm.user_id = auth.uid() and cm.removed_at is null
      ) or exists (
        select 1 from public.tasks t join public.task_assignees ta on ta.task_id = t.id and ta.organization_id = t.organization_id
        where t.client_id = c.id and t.organization_id = c.organization_id and t.requires_review
          and t.content_item_id is not null and t.deleted_at is null and t.archived_at is null
          and t.status not in ('completed', 'cancelled') and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null
      ))
  )
$$;

create or replace function private.can_manage_client_video(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_client(p_client_id) and (
    private.has_permission('clients.assign') or private.has_permission('tasks.assign') or exists (
      select 1 from public.client_members cm where cm.client_id = p_client_id
        and cm.organization_id = private.current_organization_id() and cm.user_id = auth.uid()
        and cm.client_role = 'account_manager' and cm.removed_at is null
    )
  )
$$;

create or replace function private.can_produce_client_video(p_client_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = p_user_id
      and p.organization_id = private.current_organization_id()
      and p.status = 'active' and p.deactivated_at is null and (
        exists (select 1 from public.client_members cm where cm.client_id = p_client_id
          and cm.organization_id = p.organization_id and cm.user_id = p.id
          and cm.client_role in ('video_editor', 'video_backup', 'account_manager') and cm.removed_at is null)
        or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
          and r.organization_id = ur.organization_id where ur.organization_id = p.organization_id
          and ur.user_id = p.id and r.code in ('supervisor', 'administrator'))
      )
  )
$$;
revoke all on function private.can_manage_client_video(uuid) from public, anon, authenticated;
revoke all on function private.can_produce_client_video(uuid, uuid) from public, anon, authenticated;

create or replace function public.workflow_list_client_video_editor_candidates(p_client_id uuid)
returns table(user_id uuid, display_name text, job_title text)
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(private.can_manage_client_video(p_client_id), false) then
    raise exception 'Client video assignment is not permitted' using errcode = '42501';
  end if;
  return query select p.id, p.display_name::text, p.job_title from public.profiles p
  where p.organization_id = private.current_organization_id() and p.status = 'active' and p.deactivated_at is null
    and exists (select 1 from public.user_roles ur where ur.organization_id = p.organization_id and ur.user_id = p.id)
  order by p.display_name::text, p.id;
end;
$$;

create or replace function public.set_client_video_team(p_client_id uuid, p_video_editor_id uuid, p_backup_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid := private.current_organization_id();
  previous_editor uuid;
  previous_backup uuid;
  selected_id uuid;
begin
  if auth.uid() is null or org_id is null or not coalesce(private.can_manage_client_video(p_client_id), false) then
    raise exception 'Client video assignment is not permitted' using errcode = '42501';
  end if;
  perform 1 from public.clients c where c.id = p_client_id and c.organization_id = org_id
    and c.deleted_at is null and c.status <> 'archived' for update;
  if not found then raise exception 'Active client not found' using errcode = 'P0002'; end if;
  if p_video_editor_id is not null and p_video_editor_id = p_backup_id then
    raise exception 'Choose different people for the primary and backup editor' using errcode = '22023';
  end if;
  foreach selected_id in array array[p_video_editor_id, p_backup_id] loop
    if selected_id is not null and not exists (
      select 1 from public.profiles p where p.id = selected_id and p.organization_id = org_id
        and p.status = 'active' and p.deactivated_at is null
        and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.organization_id = org_id)
    ) then raise exception 'Choose an active team member in this organization' using errcode = '22023'; end if;
  end loop;
  select cm.user_id into previous_editor from public.client_members cm where cm.client_id = p_client_id
    and cm.client_role = 'video_editor' and cm.removed_at is null order by cm.assigned_at desc limit 1;
  select cm.user_id into previous_backup from public.client_members cm where cm.client_id = p_client_id
    and cm.client_role = 'video_backup' and cm.removed_at is null;
  if previous_editor is not distinct from p_video_editor_id and previous_backup is not distinct from p_backup_id then return; end if;
  update public.client_members set removed_at = now(), is_primary = false
    where client_id = p_client_id and organization_id = org_id and removed_at is null
      and client_role in ('video_editor', 'video_backup');
  insert into public.client_members(organization_id, client_id, user_id, client_role, assigned_by, assigned_at, removed_at)
  select org_id, p_client_id, v.id, v.role, auth.uid(), now(), null from (
    values (p_video_editor_id, 'video_editor'::public.client_member_role), (p_backup_id, 'video_backup'::public.client_member_role)
  ) v(id, role) where v.id is not null
  on conflict (client_id, user_id, client_role) do update set assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at, removed_at = null, is_primary = false;
  insert into public.activity_logs(organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, auth.uid(), 'client', p_client_id, 'CLIENT_VIDEO_TEAM_CHANGED', jsonb_build_object(
    'previous_editor', previous_editor, 'previous_backup', previous_backup,
    'video_editor', p_video_editor_id, 'video_backup', p_backup_id));
end;
$$;

-- Preserve the backup when older application versions change only the primary.
create or replace function public.set_client_video_editor(p_client_id uuid, p_video_editor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare backup_id uuid;
begin
  perform 1 from public.clients c where c.id = p_client_id and c.organization_id = private.current_organization_id() for update;
  select cm.user_id into backup_id from public.client_members cm where cm.client_id = p_client_id
    and cm.organization_id = private.current_organization_id() and cm.client_role = 'video_backup' and cm.removed_at is null;
  perform public.set_client_video_team(p_client_id, p_video_editor_id, backup_id);
end;
$$;

create or replace function public.workflow_list_video_task_assignees(p_task_id uuid)
returns table(user_id uuid, display_name text, job_title text)
language plpgsql security definer set search_path = '' as $$
declare client_id uuid;
begin
  select t.client_id into client_id from public.tasks t where t.id = p_task_id
    and t.organization_id = private.current_organization_id() and t.deleted_at is null and t.archived_at is null
    and t.requires_review and exists (select 1 from public.content_items ci where ci.id = t.content_item_id and ci.content_category = 'video');
  if client_id is null or not private.can_access_task(p_task_id)
    or not coalesce(private.can_manage_client_video(client_id), false) then
    raise exception 'Task reassignment is not permitted' using errcode = '42501';
  end if;
  return query select p.id, p.display_name::text, p.job_title from public.profiles p
    where private.can_produce_client_video(client_id, p.id) order by p.display_name::text, p.id;
end;
$$;

create or replace function public.workflow_reassign_video_task(
  p_task_id uuid, p_assigned_to uuid, p_expected_owner uuid, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  old_owner uuid;
  content_id uuid;
  assignment_time timestamptz := clock_timestamp();
  event_id uuid := gen_random_uuid();
begin
  select t.content_item_id into content_id from public.tasks t where t.id = p_task_id
    and t.organization_id = private.current_organization_id();
  -- Same lock order as client review/revision: content, then task.
  perform 1 from public.content_items ci where ci.id = content_id for update;
  select * into task_row from public.tasks t where t.id = p_task_id
    and t.organization_id = private.current_organization_id() and t.deleted_at is null and t.archived_at is null for update;
  if not found or not private.can_access_task(p_task_id) or not task_row.requires_review
    or not exists (select 1 from public.content_items ci where ci.id = content_id and ci.content_category = 'video')
    or not coalesce(private.can_manage_client_video(task_row.client_id), false) then
    raise exception 'Task reassignment is not permitted' using errcode = '42501';
  end if;
  if task_row.status not in ('todo', 'in_progress', 'revision_requested') then
    raise exception 'Resolve review or approval before reassigning this task' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 1000 then
    raise exception 'Include a reassignment reason (2–1000 characters)' using errcode = '22023';
  end if;
  select ta.user_id into old_owner from public.task_assignees ta where ta.task_id = p_task_id
    and ta.is_primary and ta.removed_at is null;
  if old_owner is not distinct from p_assigned_to then return; end if;
  if old_owner is distinct from p_expected_owner then
    raise exception 'The task owner changed. Refresh the assignment and try again' using errcode = '40001';
  end if;
  if p_assigned_to is not null and not private.can_produce_client_video(task_row.client_id, p_assigned_to) then
    raise exception 'Choose the primary editor, backup, Account Manager, or Supervisor' using errcode = '22023';
  end if;
  update public.task_assignees set removed_at = assignment_time, is_primary = false
    where task_id = p_task_id and is_primary and removed_at is null;
  if p_assigned_to is not null then
    insert into public.task_assignees(organization_id, task_id, user_id, is_primary, assigned_by, assigned_at, removed_at)
    values (task_row.organization_id, p_task_id, p_assigned_to, true, auth.uid(), assignment_time, null)
    on conflict (task_id, user_id) do update set is_primary = true, assigned_by = excluded.assigned_by,
      assigned_at = excluded.assigned_at, removed_at = null;
    -- The insert trigger uses this same key; explicit enqueue also covers a promoted collaborator or self-assignment.
    perform private.enqueue_notification(task_row.organization_id, p_assigned_to, 'task_assigned', 'Task assigned',
      task_row.title, 'task', p_task_id, '/tasks/' || p_task_id::text,
      'task-assigned:' || p_task_id::text || ':' || p_assigned_to::text || ':' || assignment_time::text);
  end if;
  update public.tasks set status = 'todo', completed_at = null, updated_at = now() where id = p_task_id;
  insert into public.activity_logs(id, organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (event_id, task_row.organization_id, auth.uid(), 'task', p_task_id, 'TASK_REASSIGNED',
    jsonb_build_object('from_user_id', old_owner, 'to_user_id', p_assigned_to, 'reason', trim(p_reason), 'from_status', task_row.status));
  perform private.enqueue_notification(task_row.organization_id, old_owner, 'task_assigned', 'Task reassigned',
    task_row.title, 'task', p_task_id, '/tasks', 'task-reassigned:' || event_id::text);
end;
$$;

revoke all on function public.set_client_video_team(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_client_video_team(uuid, uuid, uuid) to authenticated;
revoke all on function public.workflow_list_video_task_assignees(uuid) from public, anon;
grant execute on function public.workflow_list_video_task_assignees(uuid) to authenticated;
revoke all on function public.workflow_reassign_video_task(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.workflow_reassign_video_task(uuid, uuid, uuid, text) to authenticated;

-- Existing RPC definitions below retain their signatures for overlapping releases.

create or replace function public.workflow_create_task_for_content_with_details(
  p_content_item_id uuid,
  p_title text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_assigned_to uuid,
  p_description text,
  p_start_at timestamptz,
  p_checklist text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  assignee_id uuid := coalesce(p_assigned_to, auth.uid());
  task_id uuid;
  checklist_item text;
  checklist_position integer;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.create') then
    raise exception 'Task creation is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 5000
    or (p_start_at is not null and p_start_at > p_due_at)
    or coalesce(array_length(p_checklist, 1), 0) > 20
    or exists (select 1 from unnest(coalesce(p_checklist, array[]::text[])) as entry(value)
      where entry.value is null or char_length(trim(entry.value)) not between 1 and 240) then
    raise exception 'Check the task brief, dates, and checklist' using errcode = '22023';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for share;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Content item not found or unavailable' using errcode = 'P0002';
  end if;
  if item_row.status in ('published', 'cancelled', 'rejected') then
    raise exception 'Published, cancelled, or rejected content cannot receive new tasks' using errcode = '22023';
  end if;

  if item_row.content_category = 'video' then
    assignee_id := p_assigned_to;
    if not coalesce(private.can_manage_client_video(item_row.client_id), false) then
      raise exception 'Only a client Account Manager or Supervisor can assign video work' using errcode = '42501';
    end if;
    if assignee_id is not null and not private.can_produce_client_video(item_row.client_id, assignee_id) then
      raise exception 'Choose this client''s editor, backup, Account Manager, or Supervisor' using errcode = '22023';
    end if;
  else
    if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
      raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
    end if;
    if assignee_id is distinct from actor_id and not exists (
      select 1 from public.client_members cm
      join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
      where cm.organization_id = org_id and cm.client_id = item_row.client_id
        and cm.user_id = assignee_id and cm.removed_at is null
        and p.status = 'active' and p.deactivated_at is null
    ) then
      raise exception 'Choose an active member assigned to this client' using errcode = '22023';
    end if;
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, content_item_id, title, description,
    status, priority, start_at, due_at, created_by, requires_review
  ) values (
    org_id, item_row.client_id, item_row.campaign_id, item_row.id, trim(p_title), nullif(trim(p_description), ''),
    'todo', p_priority, p_start_at, p_due_at, actor_id, true
  ) returning id into task_id;

  for checklist_position in 1..coalesce(array_length(p_checklist, 1), 0) loop
    checklist_item := trim(p_checklist[checklist_position]);
    insert into public.task_checklist_items (organization_id, task_id, title, position)
    values (org_id, task_id, checklist_item, checklist_position - 1);
  end loop;

  if assignee_id is not null then
    insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
    values (org_id, task_id, assignee_id, true, actor_id);
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_id, 'TASK_CREATED_FROM_CONTENT', jsonb_build_object(
    'title', trim(p_title), 'assigned_to', assignee_id,
    'content_item_id', item_row.id, 'campaign_id', item_row.campaign_id
  ));
  if assignee_id <> actor_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', task_id, 'TASK_ASSIGNED', jsonb_build_object('assigned_to', assignee_id));
  end if;

  return task_id;
end;
$$;


create or replace function private.prevent_supervisor_self_task_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitted_by = (select auth.uid())
    and private.has_permission('tasks.view_all')
    and not exists (select 1 from public.tasks t where t.id = new.task_id and t.requires_review)
    and exists (
      select 1
      from public.task_assignees ta
      where ta.organization_id = new.organization_id
        and ta.task_id = new.task_id
        and ta.user_id = (select auth.uid())
        and ta.is_primary
        and ta.removed_at is null
    ) then
    raise exception 'Your own assigned tasks do not require review; mark the task complete directly.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


create or replace function public.workflow_update_task_status(p_task_id uuid, p_status public.task_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  current_task public.tasks%rowtype;
  is_own_task boolean := false;
begin
  if actor_id is null or org_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into current_task
  from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null and t.archived_at is null
  for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) into is_own_task;

  if private.has_permission('tasks.view_all') then
    if current_task.status = 'approved' and p_status = 'completed' then
      null;
    elsif is_own_task and current_task.requires_review
      and current_task.status in ('todo', 'in_progress', 'revision_requested')
      and p_status in ('todo', 'in_progress') then
      null;
    elsif is_own_task and not current_task.requires_review
      and current_task.status in ('todo', 'in_progress', 'revision_requested')
      and p_status = 'completed' then
      null;
    else
      raise exception 'Task status change is not permitted. Content-linked work requires independent review' using errcode = '42501';
    end if;
  else
    if not is_own_task
      or current_task.status not in ('todo', 'in_progress', 'revision_requested')
      or p_status not in ('todo', 'in_progress') then
      raise exception 'Task status change is not permitted' using errcode = '42501';
    end if;
  end if;

  if current_task.status = p_status then return; end if;
  update public.tasks
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end
  where id = p_task_id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_STATUS_CHANGED',
    jsonb_build_object('from', current_task.status, 'to', p_status));
end;
$$;


commit;

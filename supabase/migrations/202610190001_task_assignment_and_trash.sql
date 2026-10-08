begin;

insert into public.permissions (code, description)
values ('tasks.trash', 'Move mistaken tasks to Trash and restore them')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'tasks.trash'
from public.roles r
where r.code in ('supervisor', 'administrator')
on conflict do nothing;

-- A task is a standalone assignment, not an automatically created duplicate
-- of a content-calendar item. Supervisors may choose an active client member.
create or replace function public.workflow_create_task(
  p_title text,
  p_client_id uuid,
  p_campaign_name text,
  p_priority public.task_priority,
  p_due_at timestamptz,
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
  assignee_id uuid := coalesce(p_assigned_to, auth.uid());
  task_id uuid;
  matched_campaign_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.create') then
    raise exception 'Task creation is not permitted' using errcode = '42501';
  end if;
  if not private.can_access_client(p_client_id) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;

  if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
    raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_campaign_name, '')), '') is not null then
    select c.id into matched_campaign_id
    from public.campaigns c
    where c.organization_id = org_id
      and c.client_id = p_client_id
      and lower(trim(c.name)) = lower(trim(p_campaign_name))
      and c.deleted_at is null
    limit 1;
    if matched_campaign_id is null then
      raise exception 'Choose an active campaign belonging to this client' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = p_client_id
      and cm.user_id = assignee_id and cm.removed_at is null
      and p.status = 'active' and p.deactivated_at is null
  ) then
    raise exception 'Choose an active member assigned to this client' using errcode = '22023';
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, title, status, priority, due_at, created_by
  ) values (
    org_id, p_client_id, matched_campaign_id, trim(p_title), 'todo', p_priority, p_due_at, actor_id
  ) returning id into task_id;

  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
  values (org_id, task_id, assignee_id, true, actor_id);

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_id, 'TASK_CREATED', jsonb_build_object(
    'title', trim(p_title), 'assigned_to', assignee_id, 'campaign_id', matched_campaign_id
  ));
  if assignee_id <> actor_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', task_id, 'TASK_ASSIGNED', jsonb_build_object('assigned_to', assignee_id));
  end if;

  return task_id;
end;
$$;

-- Disable the old self-assignment-only signature so new task creation must
-- pass through the validated assignment RPC.
revoke all on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz) from public, anon, authenticated;
revoke all on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) from public, anon;
grant execute on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) to authenticated;

create or replace function public.workflow_cancel_task_for_current_user(p_task_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype;
  is_primary_owner boolean;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'Cancellation note is too long' using errcode = '22023';
  end if;
  select * into task_row from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  select exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) into is_primary_owner;
  if private.has_permission('tasks.view_all') then
    if task_row.status in ('completed', 'cancelled') then
      raise exception 'Completed or cancelled tasks cannot be cancelled again' using errcode = '22023';
    end if;
  elsif not coalesce(is_primary_owner, false)
    or task_row.status not in ('todo', 'in_progress', 'revision_requested') then
    raise exception 'Task cancellation is not permitted' using errcode = '42501';
  end if;

  update public.tasks set status = 'cancelled', completed_at = null, updated_at = now()
  where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_CANCELLED',
    jsonb_build_object('from', task_row.status, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
end;
$$;

create or replace function public.workflow_trash_task_for_current_user(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype;
  is_owner boolean;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  select * into task_row from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null
  for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  select task_row.created_by = actor_id or exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Moving this task to Trash is not permitted' using errcode = '42501';
  end if;

  if task_row.status not in ('todo', 'in_progress', 'cancelled')
    or exists (select 1 from public.submissions s where s.organization_id = org_id and s.task_id = p_task_id)
    or exists (select 1 from public.comments c where c.organization_id = org_id and c.task_id = p_task_id)
    or exists (select 1 from public.attachments a where a.organization_id = org_id and a.task_id = p_task_id)
  then
    raise exception 'This task has work history or files. Cancel it instead of moving it to Trash.' using errcode = '22023';
  end if;

  update public.tasks set deleted_at = now() where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_MOVED_TO_TRASH');
end;
$$;

create or replace function public.workflow_list_task_trash()
returns table (
  task_id uuid,
  title text,
  client_name text,
  deleted_at timestamptz,
  created_by uuid,
  assigned_to uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, c.name, t.deleted_at, t.created_by,
    (select ta.user_id from public.task_assignees ta
      where ta.organization_id = t.organization_id and ta.task_id = t.id
        and ta.is_primary and ta.removed_at is null limit 1)
  from public.tasks t
  join public.clients c on c.id = t.client_id and c.organization_id = t.organization_id
  where t.organization_id = private.current_organization_id()
    and t.deleted_at is not null
    and (
      private.has_permission('tasks.trash')
      or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta
        where ta.organization_id = t.organization_id and ta.task_id = t.id
          and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null)
    )
  order by t.deleted_at desc
$$;

create or replace function public.workflow_restore_task_from_trash(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype;
  is_owner boolean;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  select * into task_row from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is not null
  for update;
  if not found then raise exception 'Trashed task not found' using errcode = 'P0002'; end if;

  select task_row.created_by = actor_id or exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Restoring this task is not permitted' using errcode = '42501';
  end if;
  if not private.can_access_client(task_row.client_id)
    and not private.has_permission('tasks.trash') then
    raise exception 'Client access is no longer permitted' using errcode = '42501';
  end if;

  update public.tasks set deleted_at = null where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_RESTORED_FROM_TRASH');
end;
$$;

revoke all on function public.workflow_trash_task_for_current_user(uuid) from public, anon;
revoke all on function public.workflow_list_task_trash() from public, anon;
revoke all on function public.workflow_restore_task_from_trash(uuid) from public, anon;
revoke all on function public.workflow_cancel_task_for_current_user(uuid, text) from public, anon;
grant execute on function public.workflow_trash_task_for_current_user(uuid) to authenticated;
grant execute on function public.workflow_list_task_trash() to authenticated;
grant execute on function public.workflow_restore_task_from_trash(uuid) to authenticated;
grant execute on function public.workflow_cancel_task_for_current_user(uuid, text) to authenticated;

commit;

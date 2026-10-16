begin;

-- Supervisors/admins do not need to submit their own assigned tasks for review.
-- Keep this rule in the database as task submissions can also be attempted via RPC.
create or replace function private.prevent_supervisor_self_task_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitted_by = (select auth.uid())
    and private.has_permission('tasks.view_all')
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

revoke all on function private.prevent_supervisor_self_task_review() from public, anon, authenticated;
drop trigger if exists prevent_supervisor_self_task_review on public.submission_versions;
create trigger prevent_supervisor_self_task_review
  before insert on public.submission_versions
  for each row execute function private.prevent_supervisor_self_task_review();

-- Preserve the normal employee gate and supervisor review flow. Only permit a
-- supervisor/admin to complete directly when they are the task's own primary
-- assignee and the task has not entered somebody else's review queue.
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
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null
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
    elsif is_own_task
      and current_task.status in ('todo', 'in_progress', 'revision_requested')
      and p_status = 'completed' then
      null;
    else
      raise exception 'Supervisors can complete approved tasks or their own assigned tasks' using errcode = '42501';
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

revoke all on function public.workflow_update_task_status(uuid, public.task_status) from public, anon;
grant execute on function public.workflow_update_task_status(uuid, public.task_status) to authenticated;

commit;

begin;

-- Soft-delete completed tasks as well as mistaken/cancelled work. Related
-- submissions, comments, attachments, and activity remain untouched and can
-- be accessed again if the task is restored.
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

  if task_row.status not in ('todo', 'in_progress', 'cancelled', 'completed') then
    raise exception 'Tasks awaiting review or approval must remain on the active board' using errcode = '22023';
  end if;

  update public.tasks set deleted_at = now() where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_MOVED_TO_TRASH');
end;
$$;

revoke all on function public.workflow_trash_task_for_current_user(uuid) from public, anon;
grant execute on function public.workflow_trash_task_for_current_user(uuid) to authenticated;

commit;

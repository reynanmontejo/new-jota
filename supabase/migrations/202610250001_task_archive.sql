begin;

alter table public.tasks
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_archive_state_check') then
    alter table public.tasks add constraint tasks_archive_state_check
      check (archived_at is null or (deleted_at is null and status = 'completed'));
  end if;
end;
$$;

create index if not exists tasks_active_archive_idx
  on public.tasks (organization_id, archived_at desc)
  where archived_at is not null and deleted_at is null;

create or replace function public.workflow_archive_completed_task(p_task_id uuid)
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

  select * into task_row
  from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id
    and t.deleted_at is null and t.archived_at is null
  for update;
  if not found then raise exception 'Task not found or already archived' using errcode = 'P0002'; end if;

  select task_row.created_by = actor_id or exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Archiving this task is not permitted' using errcode = '42501';
  end if;
  if task_row.status <> 'completed' then
    raise exception 'Only completed tasks can be archived' using errcode = '22023';
  end if;

  update public.tasks set archived_at = now(), archived_by = actor_id, updated_at = now()
  where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_ARCHIVED');
end;
$$;

create or replace function public.workflow_list_task_archive()
returns table (
  task_id uuid,
  title text,
  client_name text,
  status public.task_status,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid,
  assigned_to uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, c.name, t.status, t.archived_at, t.archived_by, t.created_by,
    (select ta.user_id from public.task_assignees ta
      where ta.organization_id = t.organization_id and ta.task_id = t.id
        and ta.is_primary and ta.removed_at is null limit 1)
  from public.tasks t
  join public.clients c on c.id = t.client_id and c.organization_id = t.organization_id
  where t.organization_id = private.current_organization_id()
    and t.archived_at is not null and t.deleted_at is null
    and (
      private.has_permission('tasks.trash')
      or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta
        where ta.organization_id = t.organization_id and ta.task_id = t.id
          and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null)
    )
  order by t.archived_at desc
$$;

create or replace function public.workflow_restore_task_from_archive(p_task_id uuid)
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
  where t.id = p_task_id and t.organization_id = org_id
    and t.archived_at is not null and t.deleted_at is null
  for update;
  if not found then raise exception 'Archived task not found' using errcode = 'P0002'; end if;

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

  update public.tasks set archived_at = null, archived_by = null, updated_at = now()
  where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_RESTORED_FROM_ARCHIVE');
end;
$$;

revoke all on function public.workflow_archive_completed_task(uuid) from public, anon;
revoke all on function public.workflow_list_task_archive() from public, anon;
revoke all on function public.workflow_restore_task_from_archive(uuid) from public, anon;
grant execute on function public.workflow_archive_completed_task(uuid) to authenticated;
grant execute on function public.workflow_list_task_archive() to authenticated;
grant execute on function public.workflow_restore_task_from_archive(uuid) to authenticated;

commit;

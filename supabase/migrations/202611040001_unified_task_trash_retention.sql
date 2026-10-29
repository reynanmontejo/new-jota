begin;

-- Expand first. Existing archived/trashed work receives a fresh 30-day grace
-- period on first application. Reapplication never extends an existing expiry.
alter table public.tasks add column if not exists trash_expires_at timestamptz;
update public.tasks set deleted_at = now(), archived_at = null, archived_by = null,
  trash_expires_at = now() + interval '30 days' where archived_at is not null;
update public.tasks set trash_expires_at = now() + interval '30 days'
  where deleted_at is not null and trash_expires_at is null;
create index if not exists tasks_trash_expiry_idx on public.tasks (trash_expires_at, id) where deleted_at is not null;

create or replace function private.set_task_trash_retention()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.archived_at is not null then
    new.deleted_at := coalesce(new.deleted_at, now());
    new.archived_at := null; new.archived_by := null;
  end if;
  if new.deleted_at is null then new.trash_expires_at := null;
  elsif tg_op = 'INSERT' then new.trash_expires_at := new.deleted_at + interval '30 days';
  elsif old.deleted_at is null then new.trash_expires_at := new.deleted_at + interval '30 days';
  else new.deleted_at := old.deleted_at; new.trash_expires_at := old.trash_expires_at;
  end if;
  return new;
end;
$$;
revoke all on function private.set_task_trash_retention() from public, anon, authenticated;
drop trigger if exists tasks_set_trash_retention on public.tasks;
create trigger tasks_set_trash_retention before insert or update of deleted_at, archived_at, trash_expires_at on public.tasks
for each row execute function private.set_task_trash_retention();
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.tasks'::regclass and conname = 'tasks_trash_expiry_check') then
    alter table public.tasks add constraint tasks_trash_expiry_check check (
      (deleted_at is null and trash_expires_at is null) or (deleted_at is not null and trash_expires_at is not null)
    );
  end if;
end;
$$;

create or replace function private.can_manage_task_trash(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t where t.id = p_task_id
    and t.organization_id = private.current_organization_id()
    and (private.has_permission('tasks.trash') or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta where ta.organization_id = t.organization_id
        and ta.task_id = t.id and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null)))
$$;
revoke all on function private.can_manage_task_trash(uuid) from public, anon, authenticated;

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

  -- Keep active review/approval work visible to reviewers. Work history and
  -- files are not a blocker: deleted_at only hides the task, not its children.
  if task_row.status not in ('todo', 'in_progress', 'cancelled', 'completed') then
    raise exception 'Tasks awaiting review or approval must remain on the active board' using errcode = '22023';
  end if;

  update public.tasks set archived_at = null, archived_by = null, deleted_at = now() where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_MOVED_TO_TRASH');
end;
$$;

create or replace function public.workflow_restore_task_from_trash(p_task_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype; is_owner boolean;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  select * into task_row from public.tasks t where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is not null for update;
  if not found then raise exception 'Trashed task not found' using errcode = 'P0002'; end if;
  select task_row.created_by = actor_id or exists (select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Restoring this task is not permitted' using errcode = '42501';
  end if;
  if task_row.client_id is not null and not private.can_access_client(task_row.client_id)
    and not private.has_permission('tasks.trash') then
    raise exception 'Client access is no longer permitted' using errcode = '42501';
  end if;
  if task_row.trash_expires_at <= now() then raise exception 'The 30-day restore window has expired' using errcode = '22023'; end if;
  update public.tasks set deleted_at = null where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_RESTORED_FROM_TRASH');
end;
$$;

create or replace function public.workflow_list_task_trash()
returns table (task_id uuid, title text, client_name text, deleted_at timestamptz, created_by uuid, assigned_to uuid)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.title, coalesce(c.name, 'No client'), t.deleted_at, t.created_by,
    (select ta.user_id from public.task_assignees ta where ta.organization_id = t.organization_id
      and ta.task_id = t.id and ta.is_primary and ta.removed_at is null limit 1)
  from public.tasks t
  left join public.clients c on c.id = t.client_id and c.organization_id = t.organization_id
  where t.organization_id = private.current_organization_id() and t.deleted_at is not null
    and (private.has_permission('tasks.trash') or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta where ta.organization_id = t.organization_id
        and ta.task_id = t.id and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null))
  order by t.deleted_at desc
$$;

-- Separate versioned reader: preserve the old RPC result shape for a rolling app release.
create or replace function public.workflow_list_task_trash_with_retention()
returns table (task_id uuid, title text, client_name text, deleted_at timestamptz, created_by uuid, assigned_to uuid, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select old.*, t.trash_expires_at from public.workflow_list_task_trash() old
  join public.tasks t on t.id = old.task_id and t.organization_id = private.current_organization_id()
  order by old.deleted_at desc
$$;
revoke all on function public.workflow_list_task_trash_with_retention() from public, anon;
grant execute on function public.workflow_list_task_trash_with_retention() to authenticated;

-- Compatibility aliases: old clients also use the single Trash lifecycle.
create or replace function public.workflow_archive_completed_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin perform public.workflow_trash_task_for_current_user(p_task_id); end;
$$;
create or replace function public.workflow_restore_task_from_archive(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin perform public.workflow_restore_task_from_trash(p_task_id); end;
$$;
create or replace function public.workflow_list_task_archive()
returns table (task_id uuid, title text, client_name text, status public.task_status, archived_at timestamptz, archived_by uuid, created_by uuid, assigned_to uuid)
language sql stable security definer set search_path = '' as $$
  select x.task_id, x.title, x.client_name, t.status, x.deleted_at, null::uuid, x.created_by, x.assigned_to
  from public.workflow_list_task_trash() x join public.tasks t on t.id = x.task_id
$$;

-- Purging deletes the task's private history. Approved content snapshots and
-- their exact file records are retained; private Google Drive copies are not deleted.
create or replace function private.purge_trashed_task(p_task_id uuid, p_actor_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  prior_setting text := pg_catalog.current_setting('jota.task_purge_id', true);
begin
  select * into task_row from public.tasks where id = p_task_id and deleted_at is not null for update;
  if not found then return false; end if;
  perform pg_catalog.set_config('jota.task_purge_id', task_row.id::text, true);
  delete from public.reviews r where r.organization_id = task_row.organization_id
    and r.submission_version_id in (select v.id from public.submission_versions v where v.task_id = task_row.id and v.organization_id = task_row.organization_id);
  delete from public.submission_version_files where task_id = task_row.id and organization_id = task_row.organization_id;
  delete from public.submission_versions where task_id = task_row.id and organization_id = task_row.organization_id;
  delete from public.submissions where task_id = task_row.id and organization_id = task_row.organization_id;
  -- Detach only files retained by immutable content history, assigning their original content scope.
  update public.attachments a set task_id = null, content_item_id = (
    select s.content_item_id from public.content_submission_version_files f
    join public.content_submission_versions v on v.id = f.submission_version_id and v.organization_id = f.organization_id
    join public.content_submissions s on s.id = v.submission_id and s.organization_id = v.organization_id
    where f.attachment_id = a.id and f.organization_id = a.organization_id order by v.submitted_at desc limit 1
  ) where a.task_id = task_row.id and a.organization_id = task_row.organization_id and exists (
    select 1 from public.content_submission_version_files f where f.attachment_id = a.id and f.organization_id = a.organization_id
  );
  delete from public.attachments where task_id = task_row.id and organization_id = task_row.organization_id;
  delete from public.notifications where organization_id = task_row.organization_id and entity_type = 'task' and entity_id = task_row.id;
  delete from public.tasks where id = task_row.id and organization_id = task_row.organization_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (task_row.organization_id, p_actor_id, 'task', task_row.id, 'TASK_PERMANENTLY_DELETED', jsonb_build_object('reason', p_reason));
  perform pg_catalog.set_config('jota.task_purge_id', coalesce(prior_setting, ''), true);
  return true;
exception when others then
  perform pg_catalog.set_config('jota.task_purge_id', coalesce(prior_setting, ''), true);
  raise;
end;
$$;
revoke all on function private.purge_trashed_task(uuid, uuid, text) from public, anon, authenticated, service_role;

-- Permit DELETE only inside the owner-executed, task-scoped purge. Updates and
-- ordinary deletes remain prohibited. Do not weaken content/audit immutability.
create or replace function private.guard_task_history_retention()
returns trigger language plpgsql set search_path = '' as $$
declare history_task_id uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'reviews' then
      select task_id into history_task_id from public.submission_versions where id = old.submission_version_id and organization_id = old.organization_id;
    else history_task_id := old.task_id;
    end if;
    if history_task_id::text = pg_catalog.current_setting('jota.task_purge_id', true)
      and current_user = (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p where p.oid = 'private.purge_trashed_task(uuid,uuid,text)'::regprocedure)
      and exists (select 1 from public.tasks where id = history_task_id and deleted_at is not null) then return old; end if;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;
revoke all on function private.guard_task_history_retention() from public, anon, authenticated, service_role;
drop trigger if exists submission_versions_are_immutable on public.submission_versions;
create trigger submission_versions_are_immutable before update or delete on public.submission_versions for each row execute function private.guard_task_history_retention();
drop trigger if exists task_submission_version_files_are_immutable on public.submission_version_files;
create trigger task_submission_version_files_are_immutable before update or delete on public.submission_version_files for each row execute function private.guard_task_history_retention();
drop trigger if exists reviews_are_immutable on public.reviews;
create trigger reviews_are_immutable before update or delete on public.reviews for each row execute function private.guard_task_history_retention();

create or replace function public.workflow_manage_task_trash(p_task_ids uuid[], p_action text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype; task_id uuid; changed integer := 0;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('restore', 'delete') or coalesce(cardinality(p_task_ids), 0) not between 1 and 5000
    or array_position(p_task_ids, null) is not null then raise exception 'Choose 1 to 5,000 tasks and a valid action' using errcode = '22023'; end if;
  -- Stable lock ordering prevents overlapping bulk operations from deadlocking.
  for task_id in select distinct x from unnest(p_task_ids) x order by x loop
    select * into task_row from public.tasks t where t.id = task_id and t.organization_id = org_id for update;
    if not found then
      if exists (select 1 from public.tasks t where t.id = task_id) then raise exception 'Task Trash access is not permitted' using errcode = '42501'; end if;
      continue;
    end if;
    if not private.can_manage_task_trash(task_id) then raise exception 'Task Trash access is not permitted' using errcode = '42501'; end if;
    if task_row.client_id is not null and not private.can_access_client(task_row.client_id)
      and not private.has_permission('tasks.trash') then raise exception 'Client access is no longer permitted' using errcode = '42501'; end if;
    if task_row.deleted_at is null then
      if p_action = 'restore' then continue; end if;
      raise exception 'Only tasks in Trash can be permanently deleted' using errcode = '22023';
    end if;
    if p_action = 'restore' then perform public.workflow_restore_task_from_trash(task_id); changed := changed + 1;
    elsif private.purge_trashed_task(task_id, actor_id, 'manual') then changed := changed + 1;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function public.workflow_manage_task_trash(uuid[], text) from public, anon;
grant execute on function public.workflow_manage_task_trash(uuid[], text) to authenticated;

create or replace function public.purge_expired_task_trash()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare task_row record; removed integer := 0; failed integer := 0;
begin
  for task_row in select id, organization_id from public.tasks where deleted_at is not null and trash_expires_at <= now()
    order by trash_expires_at, id limit 500 for update skip locked loop
    begin
      if private.purge_trashed_task(task_row.id, null, 'expired_30_days') then removed := removed + 1; end if;
    exception when others then
      failed := failed + 1;
      insert into public.activity_logs (organization_id, entity_type, entity_id, action, metadata)
      values (task_row.organization_id, 'task', task_row.id, 'TASK_TRASH_PURGE_FAILED', jsonb_build_object('sqlstate', sqlstate));
      raise warning 'Task Trash purge deferred for task % (SQLSTATE %)', task_row.id, sqlstate;
    end;
  end loop;
  return jsonb_build_object('deleted', removed, 'failed', failed);
end;
$$;
revoke all on function public.purge_expired_task_trash() from public, anon, authenticated;
grant execute on function public.purge_expired_task_trash() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-task-trash';
select cron.schedule('purge-expired-task-trash', '15 * * * *', 'select public.purge_expired_task_trash();');

commit;

-- Repair for installations where the client deletion RPC exists but
-- private.purge_trashed_task(uuid,uuid,text) is missing.
-- Restores only the helper/history guards from 202611040001. Applying this
-- migration does not delete records, backfill Trash dates, or schedule jobs.
-- Retain these private helpers during app rollback; callers remain responsible
-- for authorization and explicit confirmation. Direct browser access is denied.
begin;

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

notify pgrst, 'reload schema';
commit;

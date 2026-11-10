-- Additive capability only: applying this migration deletes no client data.
-- Requires task Trash retention (202611040001). The only destructive entry
-- point requires an active administrator, a trashed client and its typed name.
-- App rollback: deploy the previous app and revoke EXECUTE on the new RPC.
-- Keep this scoped history guard installed; ordinary history is still immutable.
begin;

create or replace function private.guard_content_history_client_purge()
returns trigger language plpgsql set search_path = '' as $$
declare history_client uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'content_submission_versions' then
      select s.client_id into history_client from public.content_submissions s
        where s.id = old.submission_id and s.organization_id = old.organization_id;
    else
      select s.client_id into history_client from public.content_submission_versions v
        join public.content_submissions s on s.id = v.submission_id and s.organization_id = v.organization_id
        where v.id = old.submission_version_id and v.organization_id = old.organization_id;
    end if;
    if history_client::text = pg_catalog.current_setting('jota.client_purge_id', true)
      and current_user = (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
        where p.oid = 'public.permanently_delete_client_from_trash(uuid,text)'::regprocedure)
      and exists (select 1 from public.clients c where c.id = history_client
        and c.organization_id = old.organization_id and c.deleted_at is not null) then
      return old;
    end if;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;
revoke all on function private.guard_content_history_client_purge() from public, anon, authenticated, service_role;

drop trigger if exists content_submission_versions_are_immutable on public.content_submission_versions;
create trigger content_submission_versions_are_immutable before update or delete on public.content_submission_versions
  for each row execute function private.guard_content_history_client_purge();
drop trigger if exists content_submission_version_files_are_immutable on public.content_submission_version_files;
create trigger content_submission_version_files_are_immutable before update or delete on public.content_submission_version_files
  for each row execute function private.guard_content_history_client_purge();
drop trigger if exists content_reviews_are_immutable on public.content_reviews;
create trigger content_reviews_are_immutable before update or delete on public.content_reviews
  for each row execute function private.guard_content_history_client_purge();

create or replace function public.permanently_delete_client_from_trash(p_client_id uuid, p_confirmation_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  org uuid := private.current_organization_id();
  actor uuid := auth.uid();
  target public.clients%rowtype;
  task_id uuid;
  previous_purge text := pg_catalog.current_setting('jota.client_purge_id', true);
  previous_handoff text := pg_catalog.current_setting('jota.client_handoff_write', true);
begin
  if org is null or actor is null or not coalesce(private.has_permission('clients.trash'), false)
    or not exists (select 1 from public.user_roles ur join public.roles r
      on r.id = ur.role_id and r.organization_id = ur.organization_id
      where ur.organization_id = org and ur.user_id = actor and r.code = 'administrator') then
    raise exception 'Permanent client deletion requires an administrator' using errcode = '42501';
  end if;
  select * into target from public.clients c where c.id = p_client_id and c.organization_id = org for update;
  if not found then
    -- A successful retry is harmless, without treating a foreign client's ID
    -- as a successful delete or exposing its existence.
    if exists (select 1 from public.activity_logs l where l.organization_id = org
      and l.entity_type = 'client' and l.entity_id = p_client_id and l.action = 'CLIENT_PERMANENTLY_DELETED'
      and l.metadata->>'name' = trim(coalesce(p_confirmation_name, ''))) then return false; end if;
    raise exception 'Trashed client not found' using errcode = 'P0002';
  end if;
  if target.deleted_at is null then raise exception 'Move this client to Trash first' using errcode = '22023'; end if;
  if trim(coalesce(p_confirmation_name, '')) <> target.name then
    raise exception 'Type the client name to confirm permanent deletion' using errcode = '22023';
  end if;

  -- Lock parents before children. Foreign-key checks block new linked records
  -- during the purge; any unexpected reference rolls the entire call back.
  perform 1 from public.campaigns c where c.organization_id = org and c.client_id = target.id order by c.id for update;
  perform 1 from public.content_items c where c.organization_id = org and c.client_id = target.id order by c.id for update;
  perform 1 from public.tasks t where t.organization_id = org and t.client_id = target.id order by t.id for update;
  perform pg_catalog.set_config('jota.client_purge_id', target.id::text, true);
  perform pg_catalog.set_config('jota.client_handoff_write', 'on', true);
  update public.content_items set client_handoff_version_id = null, client_sent_at = null, client_sent_by = null
    where organization_id = org and client_id = target.id;

  delete from public.content_reviews r where r.organization_id = org and r.submission_version_id in (
    select v.id from public.content_submission_versions v join public.content_submissions s
      on s.id = v.submission_id and s.organization_id = v.organization_id
      where s.organization_id = org and s.client_id = target.id);
  delete from public.content_submission_version_files f where f.organization_id = org and f.submission_version_id in (
    select v.id from public.content_submission_versions v join public.content_submissions s
      on s.id = v.submission_id and s.organization_id = v.organization_id
      where s.organization_id = org and s.client_id = target.id);
  delete from public.content_submission_versions v where v.organization_id = org and v.submission_id in (
    select s.id from public.content_submissions s where s.organization_id = org and s.client_id = target.id);
  delete from public.content_submissions where organization_id = org and client_id = target.id;

  for task_id in select t.id from public.tasks t where t.organization_id = org and t.client_id = target.id order by t.id loop
    update public.tasks set deleted_at = coalesce(deleted_at, now()) where id = task_id and organization_id = org;
    perform private.purge_trashed_task(task_id, actor, 'client_permanently_deleted');
  end loop;
  delete from public.notifications n where n.organization_id = org and (
    (n.entity_type = 'client' and n.entity_id = target.id)
    or (n.entity_type = 'content_item' and n.entity_id in (select c.id from public.content_items c where c.organization_id = org and c.client_id = target.id))
    or (n.entity_type = 'campaign' and n.entity_id in (select c.id from public.campaigns c where c.organization_id = org and c.client_id = target.id))
    or (n.entity_type = 'meeting' and n.entity_id in (select m.id from public.meetings m where m.organization_id = org and m.client_id = target.id)));
  delete from public.attachments where organization_id = org and client_id = target.id;
  delete from public.content_items where organization_id = org and client_id = target.id;
  delete from public.campaigns where organization_id = org and client_id = target.id;
  delete from public.meetings where organization_id = org and client_id = target.id;
  -- Client memberships and private Drive folder mappings cascade. No external
  -- Google Drive deletion is attempted. Independent reports and audit remain.
  delete from public.clients where organization_id = org and id = target.id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org, actor, 'client', target.id, 'CLIENT_PERMANENTLY_DELETED',
      jsonb_build_object('name', target.name, 'drive_files_deleted', false));
  perform pg_catalog.set_config('jota.client_purge_id', coalesce(previous_purge, ''), true);
  perform pg_catalog.set_config('jota.client_handoff_write', coalesce(previous_handoff, ''), true);
  return true;
exception when others then
  perform pg_catalog.set_config('jota.client_purge_id', coalesce(previous_purge, ''), true);
  perform pg_catalog.set_config('jota.client_handoff_write', coalesce(previous_handoff, ''), true);
  raise;
end;
$$;
revoke all on function public.permanently_delete_client_from_trash(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.permanently_delete_client_from_trash(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;

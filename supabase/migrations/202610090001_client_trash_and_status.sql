begin;

insert into public.permissions (code, description)
values ('clients.trash', 'Move clients to Trash and restore them')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'clients.trash'
from public.roles r
where r.code in ('supervisor', 'administrator')
on conflict do nothing;

-- Keep bootstrap-created Supervisor roles aligned with existing organizations.
create or replace function public.bootstrap_initial_administrator(
  p_organization_name text,
  p_organization_slug text,
  p_timezone text,
  p_display_name text,
  p_job_title text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  org_id uuid;
  account_manager_role uuid;
  supervisor_role uuid;
  administrator_role uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_organization_name)) not between 2 and 120
    or p_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(trim(p_display_name)) not between 2 and 120
    or char_length(coalesce(trim(p_job_title), '')) > 120
    or char_length(trim(p_timezone)) not between 1 and 80
  then raise exception 'Invalid setup details'; end if;

  perform pg_advisory_xact_lock(hashtextextended('joyno-initial-admin-bootstrap', 0));
  if exists (select 1 from public.organizations) or exists (select 1 from public.profiles) then
    raise exception 'Initial administrator setup is already complete';
  end if;

  select u.email into actor_email from auth.users u where u.id = actor_id;
  if actor_email is null then raise exception 'Authenticated account was not found'; end if;

  insert into public.organizations(name, slug, timezone)
    values (trim(p_organization_name), lower(trim(p_organization_slug)), trim(p_timezone))
    returning id into org_id;

  insert into public.roles(organization_id, code, name, description, is_system)
    values (org_id, 'account_manager', 'Account Manager', 'Manages assigned client work.', true)
    returning id into account_manager_role;
  insert into public.roles(organization_id, code, name, description, is_system)
    values (org_id, 'supervisor', 'Supervisor', 'Coordinates teams and reviews submissions.', true)
    returning id into supervisor_role;
  insert into public.roles(organization_id, code, name, description, is_system)
    values (org_id, 'administrator', 'Administrator', 'Manages the organization and access.', true)
    returning id into administrator_role;

  insert into public.role_permissions(organization_id, role_id, permission_code)
    select org_id, account_manager_role, p.code from public.permissions p
    where p.code in ('clients.view_assigned','clients.manage','campaigns.create','campaigns.update','content.create','content.update','tasks.create','tasks.update');
  insert into public.role_permissions(organization_id, role_id, permission_code)
    select org_id, supervisor_role, p.code from public.permissions p
    where p.code in ('clients.view_assigned','clients.view_all','clients.assign','clients.trash','campaigns.create','campaigns.update','content.create','content.update','tasks.create','tasks.update','tasks.assign','tasks.review','tasks.approve','tasks.view_all','employees.view');
  insert into public.role_permissions(organization_id, role_id, permission_code)
    select org_id, administrator_role, p.code from public.permissions p;

  insert into public.profiles(id, organization_id, email, display_name, job_title, status)
    values (actor_id, org_id, actor_email, trim(p_display_name), nullif(trim(coalesce(p_job_title, '')), ''), 'active');
  insert into public.user_roles(organization_id, user_id, role_id)
    values (org_id, actor_id, administrator_role);
end;
$$;

revoke all on function public.bootstrap_initial_administrator(text, text, text, text, text) from public, anon;
grant execute on function public.bootstrap_initial_administrator(text, text, text, text, text) to authenticated;

-- Existing client reads remain scoped by private.can_access_client. This
-- additional policy exposes only trashed client summaries to authorized staff.
create policy clients_read_trash_for_managers on public.clients for select to authenticated
  using (
    organization_id = (select private.current_organization_id())
    and deleted_at is not null
    and (select private.has_permission('clients.trash'))
  );

create or replace function public.update_client_status_for_current_user(
  p_client_id uuid,
  p_status public.client_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  old_status public.client_status;
begin
  if actor_id is null or org_id is null
    or not (private.has_permission('clients.manage') or private.has_permission('clients.trash')) then
    raise exception 'Client status changes are not permitted' using errcode = '42501';
  end if;

  select c.status into old_status
  from public.clients c
  where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is null
    and private.can_access_client(c.id)
  for update;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;

  update public.clients set status = p_status, updated_at = now()
  where id = p_client_id and organization_id = org_id;

  if old_status is distinct from p_status then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'client', p_client_id, 'CLIENT_STATUS_CHANGED', jsonb_build_object('from', old_status, 'to', p_status));
  end if;
end;
$$;

create or replace function public.move_client_to_trash(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  client_name text;
begin
  if actor_id is null or org_id is null or not private.has_permission('clients.trash') then
    raise exception 'Moving clients to Trash is not permitted' using errcode = '42501';
  end if;

  select c.name into client_name
  from public.clients c
  where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is null
  for update;
  if not found then raise exception 'Active client not found' using errcode = 'P0002'; end if;

  update public.clients set deleted_at = now(), updated_at = now()
  where id = p_client_id and organization_id = org_id and deleted_at is null;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'client', p_client_id, 'CLIENT_MOVED_TO_TRASH', jsonb_build_object('name', client_name));
end;
$$;

create or replace function public.restore_client_from_trash(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  client_name text;
begin
  if actor_id is null or org_id is null or not private.has_permission('clients.trash') then
    raise exception 'Restoring clients is not permitted' using errcode = '42501';
  end if;

  select c.name into client_name
  from public.clients c
  where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is not null
  for update;
  if not found then raise exception 'Trashed client not found' using errcode = 'P0002'; end if;

  update public.clients set deleted_at = null, updated_at = now()
  where id = p_client_id and organization_id = org_id and deleted_at is not null;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'client', p_client_id, 'CLIENT_RESTORED_FROM_TRASH', jsonb_build_object('name', client_name));
end;
$$;

revoke all on function public.update_client_status_for_current_user(uuid, public.client_status) from public, anon;
revoke all on function public.move_client_to_trash(uuid) from public, anon;
revoke all on function public.restore_client_from_trash(uuid) from public, anon;
grant execute on function public.update_client_status_for_current_user(uuid, public.client_status) to authenticated;
grant execute on function public.move_client_to_trash(uuid) to authenticated;
grant execute on function public.restore_client_from_trash(uuid) to authenticated;

commit;

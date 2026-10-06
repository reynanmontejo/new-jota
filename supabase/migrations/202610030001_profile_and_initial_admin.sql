begin;

-- The very first signed-in Auth user may create the tenant and become its
-- administrator. The advisory lock and empty-tenant checks make this a
-- one-time bootstrap even if two setup requests arrive together.
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
    where p.code in ('clients.view_assigned','campaigns.create','campaigns.update','content.create','content.update','tasks.create','tasks.update');
  insert into public.role_permissions(organization_id, role_id, permission_code)
    select org_id, supervisor_role, p.code from public.permissions p
    where p.code in ('clients.view_assigned','clients.view_all','campaigns.create','campaigns.update','content.create','content.update','tasks.create','tasks.update','tasks.assign','tasks.review','tasks.approve','tasks.view_all','employees.view');
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

create or replace function public.update_own_profile(
  p_display_name text,
  p_job_title text,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_display_name)) not between 2 and 120
    or char_length(coalesce(trim(p_job_title), '')) > 120
    or char_length(coalesce(trim(p_avatar_url), '')) > 2048
    or (nullif(trim(coalesce(p_avatar_url, '')), '') is not null
      and trim(p_avatar_url) !~ '^https://[^[:space:]]+$')
  then raise exception 'Invalid profile details'; end if;

  update public.profiles
    set display_name = trim(p_display_name),
        job_title = nullif(trim(coalesce(p_job_title, '')), ''),
        avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
        updated_at = now()
    where id = actor_id and status = 'active' and deactivated_at is null;
  if not found then raise exception 'Active profile not found'; end if;
end;
$$;

revoke all on function public.update_own_profile(text, text, text) from public, anon;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

commit;

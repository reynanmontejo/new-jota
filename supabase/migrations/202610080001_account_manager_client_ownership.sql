begin;

alter table public.clients
  add column if not exists social_platforms text[] not null default '{}';

insert into public.permissions (code, description)
values ('clients.assign', 'Assign or change client Account Managers')
on conflict (code) do update set description = excluded.description;

-- Account managers may create client accounts. Their new clients are assigned
-- to them as the primary account manager so client RLS and supervisor views
-- immediately reflect the relationship.
insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'clients.manage'
from public.roles r
where r.code = 'account_manager'
on conflict do nothing;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'clients.assign'
from public.roles r
where r.code in ('supervisor', 'administrator')
on conflict do nothing;

-- Include the permission in the one-time first-organization bootstrap too, so
-- fresh installations created after this migration behave the same way.
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
    where p.code in ('clients.view_assigned','clients.view_all','clients.assign','campaigns.create','campaigns.update','content.create','content.update','tasks.create','tasks.update','tasks.assign','tasks.review','tasks.approve','tasks.view_all','employees.view');
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

drop function public.create_client_for_current_user(text, text, text, text);

create or replace function public.create_client_for_current_user(
  p_name text,
  p_slug text,
  p_description text default null,
  p_website_url text default null,
  p_social_platforms text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  client_id uuid;
  is_account_manager boolean;
  normalized_platforms text[];
begin
  if actor_id is null or org_id is null then
    raise exception 'An active authenticated workspace is required' using errcode = '42501';
  end if;
  if not private.has_permission('clients.manage') then
    raise exception 'You do not have permission to create clients' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 140
    or char_length(trim(coalesce(p_slug, ''))) not between 1 and 160
    or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(coalesce(trim(p_description), '')) > 2000
    or char_length(coalesce(trim(p_website_url), '')) > 2048
    or (nullif(trim(coalesce(p_website_url, '')), '') is not null
      and trim(p_website_url) !~ '^https://[^[:space:]]+$')
    or coalesce(cardinality(p_social_platforms), 0) > 20
    or exists (
      select 1 from unnest(coalesce(p_social_platforms, '{}'::text[])) as items(platform)
      where char_length(trim(platform)) not between 2 and 60
    )
  then
    raise exception 'Invalid client details' using errcode = '22023';
  end if;

  select coalesce(array_agg(label order by lower(label)), '{}'::text[])
    into normalized_platforms
  from (
    select min(trim(platform)) as label
    from unnest(coalesce(p_social_platforms, '{}'::text[])) as items(platform)
    group by lower(trim(platform))
  ) normalized;

  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.organization_id = ur.organization_id
    where ur.organization_id = org_id and ur.user_id = actor_id and r.code = 'account_manager'
  ) into is_account_manager;

  insert into public.clients (organization_id, name, slug, description, website_url, social_platforms, created_by)
  values (
    org_id,
    trim(p_name),
    lower(trim(p_slug)),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_website_url, '')), ''),
    normalized_platforms,
    actor_id
  )
  returning id into client_id;

  if is_account_manager then
    insert into public.client_members (organization_id, client_id, user_id, client_role, is_primary)
    values (org_id, client_id, actor_id, 'account_manager', true);
  end if;

  return client_id;
end;
$$;

revoke all on function public.create_client_for_current_user(text, text, text, text, text[]) from public, anon;
grant execute on function public.create_client_for_current_user(text, text, text, text, text[]) to authenticated;

create or replace function public.set_client_account_managers(
  p_client_id uuid,
  p_account_manager_ids uuid[],
  p_primary_account_manager_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  valid_manager_count integer;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('clients.assign') then
    raise exception 'You do not have permission to assign client Account Managers' using errcode = '42501';
  end if;
  if p_account_manager_ids is null or cardinality(p_account_manager_ids) not between 1 and 20
    or exists (select 1 from unnest(p_account_manager_ids) as items(manager_id) where manager_id is null)
    or cardinality(p_account_manager_ids) <> (select count(distinct manager_id) from unnest(p_account_manager_ids) as items(manager_id))
    or p_primary_account_manager_id is null
    or not (p_primary_account_manager_id = any(p_account_manager_ids))
  then raise exception 'Select one or more managers and choose one of them as primary' using errcode = '22023'; end if;

  perform 1 from public.clients c
  where c.id = p_client_id and c.organization_id = org_id and c.deleted_at is null
  for update;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;

  select count(distinct requested.user_id)::integer into valid_manager_count
  from unnest(p_account_manager_ids) as requested(user_id)
  join public.profiles p on p.id = requested.user_id and p.organization_id = org_id
  join public.user_roles ur on ur.user_id = p.id and ur.organization_id = org_id
  join public.roles r on r.id = ur.role_id and r.organization_id = org_id and r.code = 'account_manager'
  where p.status = 'active' and p.deactivated_at is null;
  if valid_manager_count <> cardinality(p_account_manager_ids) then
    raise exception 'Every selected Account Manager must be active and belong to this organization' using errcode = '22023';
  end if;

  update public.client_members
    set is_primary = false
    where organization_id = org_id and client_id = p_client_id
      and client_role = 'account_manager' and removed_at is null;

  update public.client_members
    set removed_at = now(), is_primary = false
    where organization_id = org_id and client_id = p_client_id
      and client_role = 'account_manager' and removed_at is null
      and not (user_id = any(p_account_manager_ids));

  insert into public.client_members (organization_id, client_id, user_id, client_role, is_primary, assigned_by, assigned_at, removed_at)
  select org_id, p_client_id, requested.user_id, 'account_manager', requested.user_id = p_primary_account_manager_id, actor_id, now(), null
  from unnest(p_account_manager_ids) as requested(user_id)
  on conflict (client_id, user_id, client_role) do update
    set is_primary = excluded.is_primary,
        assigned_by = excluded.assigned_by,
        assigned_at = excluded.assigned_at,
        removed_at = null;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'client', p_client_id, 'CLIENT_ACCOUNT_MANAGERS_CHANGED',
    jsonb_build_object('account_manager_ids', p_account_manager_ids, 'primary_account_manager_id', p_primary_account_manager_id));
end;
$$;

revoke all on function public.set_client_account_managers(uuid, uuid[], uuid) from public, anon;
grant execute on function public.set_client_account_managers(uuid, uuid[], uuid) to authenticated;

commit;

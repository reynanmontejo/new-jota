begin;

-- Keep the profile UUID stable for task, comment, and audit history while
-- allowing the corresponding Supabase Auth account to be deleted later.
alter table public.profiles add column if not exists auth_user_id uuid;
update public.profiles set auth_user_id = id where auth_user_id is null;
create unique index if not exists profiles_auth_user_id_unique_idx
  on public.profiles(auth_user_id) where auth_user_id is not null;
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles drop constraint if exists profiles_auth_user_id_fkey;
alter table public.profiles add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

create or replace function public.bind_profile_auth_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.auth_user_id := coalesce(new.auth_user_id, new.id);
  elsif old.auth_user_id is not null and new.auth_user_id is not null and new.auth_user_id <> old.auth_user_id then
    raise exception 'An employee profile cannot be rebound to another Auth account';
  end if;
  return new;
end;
$$;
revoke all on function public.bind_profile_auth_user_id() from public, anon, authenticated;
drop trigger if exists profiles_bind_auth_user_id on public.profiles;
create trigger profiles_bind_auth_user_id before insert or update of auth_user_id on public.profiles
  for each row execute function public.bind_profile_auth_user_id();

alter table public.profiles add column if not exists deletion_requested_at timestamptz;
alter table public.profiles add column if not exists purge_after_at timestamptz;
alter table public.profiles add column if not exists purged_at timestamptz;
alter table public.profiles drop constraint if exists profiles_deletion_schedule_check;
alter table public.profiles add constraint profiles_deletion_schedule_check check (
  (deletion_requested_at is null or (status = 'inactive' and purge_after_at is not null))
  and (purged_at is null or (deletion_requested_at is not null and auth_user_id is null and status = 'inactive'))
);

insert into public.permissions(code, description)
values ('employees.delete', 'Move employee accounts to trash and restore them during the grace period')
on conflict (code) do nothing;

insert into public.role_permissions(organization_id, role_id, permission_code)
select r.organization_id, r.id, 'employees.delete'
from public.roles r where r.code = 'administrator'
on conflict do nothing;

create or replace function public.admin_move_employee_to_trash(
  p_actor_id uuid,
  p_employee_id uuid,
  p_confirmation_email text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  target_email text;
  target_status public.employee_status;
  is_admin boolean;
  purge_at timestamptz := now() + interval '30 days';
begin
  select p.organization_id into org_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
      where ur.organization_id = p.organization_id and ur.user_id = p.id and rp.permission_code = 'employees.delete'
    )
  limit 1;
  if org_id is null then raise exception 'Employee deletion is not permitted' using errcode = '42501'; end if;
  if p_employee_id = p_actor_id then raise exception 'You cannot delete your own account' using errcode = '42501'; end if;

  select p.email::text, p.status into target_email, target_status
  from public.profiles p where p.id = p_employee_id and p.organization_id = org_id for update;
  if target_email is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  select exists (
    select 1 from public.user_roles ur join public.roles r
      on r.organization_id = ur.organization_id and r.id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_employee_id and r.code = 'administrator'
  ) into is_admin;
  if is_admin then raise exception 'Administrator accounts cannot be moved to trash' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = p_employee_id and p.deletion_requested_at is not null) then
    raise exception 'Employee account is already in Trash' using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_confirmation_email, ''))) <> lower(target_email) then
    raise exception 'Confirmation email does not match' using errcode = '22023';
  end if;
  if target_status not in ('active', 'inactive', 'invited') then
    raise exception 'Employee account cannot be deleted in its current state' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_employee_id and p.purged_at is not null) then
    raise exception 'Employee account was already permanently removed' using errcode = '22023';
  end if;

  update public.profiles set status = 'inactive', deactivated_at = coalesce(deactivated_at, now()),
    deletion_requested_at = now(), purge_after_at = purge_at, updated_at = now()
  where id = p_employee_id and organization_id = org_id;
  return purge_at;
end;
$$;

create or replace function public.admin_restore_employee_from_trash(p_actor_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare org_id uuid; target_is_admin boolean;
begin
  select p.organization_id into org_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
      where ur.organization_id = p.organization_id and ur.user_id = p.id and rp.permission_code = 'employees.delete'
    )
  limit 1;
  if org_id is null then raise exception 'Employee restore is not permitted' using errcode = '42501'; end if;
  select exists (
    select 1 from public.user_roles ur join public.roles r
      on r.organization_id = ur.organization_id and r.id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_employee_id and r.code = 'administrator'
  ) into target_is_admin;
  if target_is_admin then raise exception 'Administrator accounts are protected' using errcode = '42501'; end if;
  update public.profiles set status = 'active', deactivated_at = null, deletion_requested_at = null,
    purge_after_at = null, updated_at = now()
  where id = p_employee_id and organization_id = org_id and deletion_requested_at is not null
    and purge_after_at > now() and purged_at is null and auth_user_id is not null;
  if not found then raise exception 'Restore period has expired or account is unavailable' using errcode = 'P0002'; end if;
end;
$$;

-- Existing employee-edit RPCs remain permission-gated, and now refuse changes
-- to an account while it is in Trash; restoration uses its dedicated RPC.
create or replace function public.admin_update_employee(
  p_actor_id uuid, p_employee_id uuid, p_display_name text, p_job_title text,
  p_role_code text, p_status public.employee_status
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  org_id uuid;
  target_role_id uuid;
  current_status public.employee_status;
  target_is_admin boolean;
  target_in_trash boolean;
  required_permission text;
begin
  select p.organization_id into org_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  join public.user_roles ur on ur.organization_id = p.organization_id and ur.user_id = p.id
  join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and rp.permission_code in ('employees.update', 'employees.deactivate') limit 1;
  if org_id is null then raise exception 'Employee management is not permitted' using errcode = '42501'; end if;

  select p.status, p.deletion_requested_at is not null into current_status, target_in_trash
  from public.profiles p where p.id = p_employee_id and p.organization_id = org_id for update;
  if current_status is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if target_in_trash then raise exception 'Restore the account before editing it' using errcode = '42501'; end if;

  select exists (
    select 1 from public.user_roles ur join public.roles r
      on r.organization_id = ur.organization_id and r.id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_employee_id and r.code = 'administrator'
  ) into target_is_admin;
  if target_is_admin then raise exception 'Administrator accounts cannot be changed here' using errcode = '42501'; end if;
  if p_employee_id = p_actor_id and p_status = 'inactive' then raise exception 'You cannot deactivate your own account' using errcode = '42501'; end if;

  required_permission := case when p_status is distinct from current_status then 'employees.deactivate' else 'employees.update' end;
  if not exists (
    select 1 from public.user_roles ur join public.role_permissions rp
      on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_actor_id and rp.permission_code = required_permission
  ) then raise exception 'This employee change is not permitted' using errcode = '42501'; end if;
  if p_role_code not in ('account_manager', 'supervisor') or p_status not in ('active', 'inactive')
    or char_length(trim(p_display_name)) not between 2 and 120
    or char_length(trim(coalesce(p_job_title, ''))) > 120 then
    raise exception 'Employee details are invalid' using errcode = '22023';
  end if;
  select r.id into target_role_id from public.roles r where r.organization_id = org_id and r.code = p_role_code;
  if target_role_id is null then raise exception 'Role is unavailable' using errcode = 'P0002'; end if;

  update public.profiles p set display_name = trim(p_display_name),
    job_title = nullif(trim(coalesce(p_job_title, '')), ''), status = p_status,
    deactivated_at = case when p_status = 'inactive' then coalesce(p.deactivated_at, now()) else null end,
    updated_at = now()
  where p.id = p_employee_id and p.organization_id = org_id;
  delete from public.user_roles ur where ur.organization_id = org_id and ur.user_id = p_employee_id;
  insert into public.user_roles(organization_id, user_id, role_id, assigned_by)
  values (org_id, p_employee_id, target_role_id, p_actor_id);
end;
$$;

-- Called only after Auth deletion succeeds. The stable profile row remains as
-- an anonymized tombstone so historical work continues to resolve safely.
create or replace function public.finalize_expired_employee_deletion(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare org_id uuid;
begin
  select p.organization_id into org_id from public.profiles p
  where p.id = p_employee_id and p.deletion_requested_at is not null
    and p.purge_after_at <= now() and p.purged_at is null and p.auth_user_id is null
    and p.status = 'inactive' for update;
  if org_id is null then raise exception 'Employee deletion is not ready to finalize' using errcode = 'P0002'; end if;

  delete from public.user_roles where organization_id = org_id and user_id = p_employee_id;
  delete from public.client_members where organization_id = org_id and user_id = p_employee_id;
  delete from public.team_members where organization_id = org_id and user_id = p_employee_id;
  delete from public.notifications where organization_id = org_id and recipient_id = p_employee_id;

  update public.profiles set email = 'deleted+' || replace(p_employee_id::text, '-', '') || '@deleted.invalid',
    display_name = 'Deleted employee', job_title = null, avatar_url = null, purged_at = now(), updated_at = now()
  where id = p_employee_id and organization_id = org_id;
end;
$$;

revoke all on function public.admin_move_employee_to_trash(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_restore_employee_from_trash(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_expired_employee_deletion(uuid) from public, anon, authenticated;
grant execute on function public.admin_move_employee_to_trash(uuid, uuid, text) to service_role;
grant execute on function public.admin_restore_employee_from_trash(uuid, uuid) to service_role;
grant execute on function public.finalize_expired_employee_deletion(uuid) to service_role;

-- Supabase Cron executes the Auth deletion and profile anonymization hourly.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-employee-accounts';
select cron.schedule(
  'purge-expired-employee-accounts',
  '0 * * * *',
  $job$do $$
  declare account record;
  begin
    for account in select id, auth_user_id from public.profiles
      where deletion_requested_at is not null and purge_after_at <= now() and purged_at is null
      order by purge_after_at limit 100
    loop
      begin
        if account.auth_user_id is not null then
          delete from auth.users where id = account.auth_user_id;
          if not found then raise exception 'Auth account could not be deleted'; end if;
        end if;
        perform public.finalize_expired_employee_deletion(account.id);
      exception when others then
        raise warning 'Employee account purge deferred for profile %: %', account.id, sqlerrm;
      end;
    end loop;
  end;
  $$;$job$
);

commit;

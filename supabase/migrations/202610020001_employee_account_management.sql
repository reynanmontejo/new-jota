begin;
create or replace function public.admin_provision_employee(
  p_user_id uuid, p_actor_id uuid, p_email text, p_display_name text, p_job_title text, p_role_code text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare org_id uuid; target_role_id uuid;
begin
  select p.organization_id into org_id from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  join public.user_roles ur on ur.organization_id = p.organization_id and ur.user_id = p.id
  join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and rp.permission_code = 'employees.create' limit 1;
  if org_id is null then raise exception 'Employee creation is not permitted' using errcode = '42501'; end if;
  if p_role_code not in ('account_manager', 'supervisor') then raise exception 'This role cannot be provisioned here' using errcode = '22023'; end if;
  if char_length(trim(p_display_name)) not between 2 and 120 or char_length(trim(coalesce(p_job_title, ''))) > 120 then
    raise exception 'Employee details are invalid' using errcode = '22023';
  end if;
  select r.id into target_role_id from public.roles r where r.organization_id = org_id and r.code = p_role_code;
  if target_role_id is null then raise exception 'Role is unavailable' using errcode = 'P0002'; end if;
  insert into public.profiles (id, organization_id, email, display_name, job_title, status)
  values (p_user_id, org_id, lower(trim(p_email)), trim(p_display_name), nullif(trim(coalesce(p_job_title, '')), ''), 'active');
  insert into public.user_roles (organization_id, user_id, role_id, assigned_by) values (org_id, p_user_id, target_role_id, p_actor_id);
end;
$$;

create or replace function public.admin_update_employee(
  p_actor_id uuid, p_employee_id uuid, p_display_name text, p_job_title text, p_role_code text, p_status public.employee_status
)
returns void language plpgsql security definer set search_path = ''
as $$
declare org_id uuid; target_role_id uuid; current_status public.employee_status; target_is_admin boolean; required_permission text;
begin
  select p.organization_id into org_id from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  join public.user_roles ur on ur.organization_id = p.organization_id and ur.user_id = p.id
  join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and rp.permission_code in ('employees.update', 'employees.deactivate') limit 1;
  if org_id is null then raise exception 'Employee management is not permitted' using errcode = '42501'; end if;
  select p.status into current_status from public.profiles p where p.id = p_employee_id and p.organization_id = org_id for update;
  if current_status is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  select exists (select 1 from public.user_roles ur join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_employee_id and r.code = 'administrator') into target_is_admin;
  if target_is_admin then raise exception 'Administrator accounts cannot be changed here' using errcode = '42501'; end if;
  if p_employee_id = p_actor_id and p_status = 'inactive' then raise exception 'You cannot deactivate your own account' using errcode = '42501'; end if;
  required_permission := case when p_status is distinct from current_status then 'employees.deactivate' else 'employees.update' end;
  if not exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_actor_id and rp.permission_code = required_permission) then
    raise exception 'This employee change is not permitted' using errcode = '42501';
  end if;
  if p_role_code not in ('account_manager', 'supervisor') or p_status not in ('active', 'inactive')
    or char_length(trim(p_display_name)) not between 2 and 120 or char_length(trim(coalesce(p_job_title, ''))) > 120 then
    raise exception 'Employee details are invalid' using errcode = '22023';
  end if;
  select r.id into target_role_id from public.roles r where r.organization_id = org_id and r.code = p_role_code;
  if target_role_id is null then raise exception 'Role is unavailable' using errcode = 'P0002'; end if;
  update public.profiles p set display_name = trim(p_display_name), job_title = nullif(trim(coalesce(p_job_title, '')), ''),
    status = p_status, deactivated_at = case when p_status = 'inactive' then coalesce(p.deactivated_at, now()) else null end, updated_at = now()
    where p.id = p_employee_id and p.organization_id = org_id;
  delete from public.user_roles ur where ur.organization_id = org_id and ur.user_id = p_employee_id;
  insert into public.user_roles (organization_id, user_id, role_id, assigned_by) values (org_id, p_employee_id, target_role_id, p_actor_id);
end;
$$;

revoke all on function public.admin_provision_employee(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_employee(uuid, uuid, text, text, text, public.employee_status) from public, anon, authenticated;
grant execute on function public.admin_provision_employee(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.admin_update_employee(uuid, uuid, text, text, text, public.employee_status) to service_role;
commit;

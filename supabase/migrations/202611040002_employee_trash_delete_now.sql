begin;

-- Explicit deletion only: applying this migration does not delete any accounts.
-- Reuse the existing retention finalizer so historical profile references survive.
create or replace function public.admin_permanently_delete_employee(
  p_actor_id uuid,
  p_employee_id uuid,
  p_confirmation_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  target record;
begin
  select p.organization_id into org_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id and o.is_active and o.deleted_at is null
  where p.id = p_actor_id and p.status = 'active' and p.deactivated_at is null
    and p.deletion_requested_at is null and p.purged_at is null
    and exists (
      select 1 from public.user_roles ur
      join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
      join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
      where ur.organization_id = p.organization_id and ur.user_id = p.id
        and r.code = 'administrator' and rp.permission_code = 'employees.delete'
    );
  if org_id is null then raise exception 'Permanent employee deletion is not permitted' using errcode = '42501'; end if;
  if p_employee_id = p_actor_id then raise exception 'You cannot delete your own account' using errcode = '42501'; end if;

  select p.email::text as email, p.auth_user_id, p.deletion_requested_at, p.purged_at, p.status
  into target from public.profiles p
  where p.id = p_employee_id and p.organization_id = org_id for update;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.user_roles ur
    join public.roles r on r.organization_id = ur.organization_id and r.id = ur.role_id
    where ur.organization_id = org_id and ur.user_id = p_employee_id and r.code = 'administrator'
  ) then raise exception 'Administrator accounts are protected' using errcode = '42501'; end if;
  -- A repeated successful request is harmless, and does not create another audit.
  if target.purged_at is not null then return; end if;
  if target.deletion_requested_at is null or target.status <> 'inactive' then
    raise exception 'Move this account to Trash before permanently deleting it' using errcode = '55000';
  end if;
  if lower(trim(coalesce(p_confirmation_email, ''))) <> lower(target.email) then
    raise exception 'Confirmation email does not match' using errcode = '22023';
  end if;

  -- Lock, Auth removal, anonymization, and audit are one transaction. Failure
  -- rolls back the deadline too, preserving the existing restore window.
  update public.profiles set purge_after_at = least(purge_after_at, now())
  where id = p_employee_id and organization_id = org_id;
  if target.auth_user_id is not null then
    delete from auth.users where id = target.auth_user_id;
    if not found then raise exception 'Auth account is unavailable' using errcode = 'P0002'; end if;
  end if;
  perform public.finalize_expired_employee_deletion(p_employee_id);
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, p_actor_id, 'employee', p_employee_id, 'EMPLOYEE_PERMANENTLY_DELETED');
end;
$$;

revoke all on function public.admin_permanently_delete_employee(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_permanently_delete_employee(uuid, uuid, text) to service_role;

commit;

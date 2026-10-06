begin;

-- Preserve the employee's state before trashing so restoring a previously
-- deactivated (or invited) account does not unexpectedly activate it.
alter table public.profiles add column if not exists pre_trash_status public.employee_status;

-- Recover existing Trash rows as accurately as possible. The original trash
-- RPC kept an older deactivation timestamp for already-inactive profiles.
update public.profiles
set pre_trash_status = case
  when deactivated_at < deletion_requested_at then 'inactive'::public.employee_status
  else 'active'::public.employee_status
end
where deletion_requested_at is not null and pre_trash_status is null;

alter table public.profiles drop constraint if exists profiles_deletion_schedule_check;
alter table public.profiles add constraint profiles_deletion_schedule_check check (
  (deletion_requested_at is null or (
    status = 'inactive' and purge_after_at is not null and pre_trash_status is not null
  ))
  and (deletion_requested_at is not null or pre_trash_status is null)
  and (purged_at is null or (deletion_requested_at is not null and auth_user_id is null and status = 'inactive'))
);

create or replace function public.snapshot_employee_status_before_trash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deletion_requested_at is null and new.deletion_requested_at is not null then
    new.pre_trash_status := old.status;
  end if;
  return new;
end;
$$;
revoke all on function public.snapshot_employee_status_before_trash() from public, anon, authenticated;
drop trigger if exists profiles_snapshot_status_before_trash on public.profiles;
create trigger profiles_snapshot_status_before_trash
before update of deletion_requested_at on public.profiles
for each row execute function public.snapshot_employee_status_before_trash();

create or replace function public.admin_restore_employee_from_trash(p_actor_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare org_id uuid;
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

  update public.profiles
  set status = pre_trash_status,
      deactivated_at = case when pre_trash_status = 'inactive' then deactivated_at else null end,
      deletion_requested_at = null,
      purge_after_at = null,
      pre_trash_status = null,
      updated_at = now()
  where id = p_employee_id and organization_id = org_id
    and deletion_requested_at is not null and purge_after_at > now()
    and purged_at is null and auth_user_id is not null and pre_trash_status is not null;
  if not found then raise exception 'Restore period has expired or account is unavailable' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.admin_restore_employee_from_trash(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_restore_employee_from_trash(uuid, uuid) to service_role;

commit;

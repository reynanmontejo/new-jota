import fs from "node:fs/promises"

export async function validateEmployeeDeletion(database, { administrator, supervisor, foreignAdministrator }) {
  const migration = await fs.readFile("supabase/migrations/202611040002_employee_trash_delete_now.sql", "utf8")
  await database.exec(migration)
  await database.exec(migration)
  await database.exec("begin")
  try {
    const org = (await database.query("select organization_id from public.profiles where id=$1", [administrator])).rows[0].organization_id
    const otherOrg = (await database.query("select organization_id from public.profiles where id=$1", [foreignAdministrator])).rows[0].organization_id
    const target = "b0000000-0000-4000-8000-000000000001"
    const rollbackTarget = "b0000000-0000-4000-8000-000000000002"
    const foreignTarget = "b0000000-0000-4000-8000-000000000003"
    for (const [id, organization] of [[target, org], [rollbackTarget, org], [foreignTarget, otherOrg]]) {
      await database.query("insert into auth.users(id) values ($1)", [id])
      await database.query(`insert into public.profiles(id,organization_id,email,display_name,status)
        values ($1,$2,$3,'Delete verification employee','active')`, [id, organization, `${id}@example.test`])
    }
    await database.query(`insert into public.user_roles(organization_id,user_id,role_id)
      select $1,$2,id from public.roles where organization_id=$1 and code='account_manager'`, [org, target])
    const task = (await database.query(`insert into public.tasks(organization_id,title,created_by)
      values ($1,'Retained employee history',$2) returning id`, [org, target])).rows[0].id
    await database.query(`insert into public.task_assignees(organization_id,task_id,user_id,is_primary) values ($1,$2,$3,true)`, [org, task, target])
    await database.query(`insert into public.comments(organization_id,task_id,author_id,body) values ($1,$2,$3,'Retain this history')`, [org, task, target])

    const run = async (role, sql, params) => {
      await database.exec("savepoint employee_delete_call")
      try {
        await database.exec(`set local role ${role}`)
        const result = await database.query(sql, params)
        await database.exec("reset role; release savepoint employee_delete_call")
        return result
      } catch (error) {
        await database.exec("rollback to savepoint employee_delete_call; release savepoint employee_delete_call")
        throw error
      }
    }
    const remove = (actor, id, email = `${id}@example.test`, role = "service_role") =>
      run(role, "select public.admin_permanently_delete_employee($1,$2,$3)", [actor, id, email])
    const expectError = async (operation, code) => {
      try { await operation() } catch (error) { if (error.code === code) return; throw error }
      throw new Error(`Expected ${code} for permanent employee deletion protection`)
    }
    await expectError(() => remove(administrator, target, undefined, "authenticated"), "42501")
    await expectError(() => remove(administrator, target, undefined, "anon"), "42501")
    await expectError(() => remove(supervisor, target), "42501")
    await database.query(`insert into public.role_permissions(organization_id,role_id,permission_code)
      select $1,id,'employees.delete' from public.roles where organization_id=$1 and code='supervisor' on conflict do nothing`, [org])
    await expectError(() => remove(supervisor, target), "42501")
    await expectError(() => remove(administrator, administrator), "42501")
    await expectError(() => remove(administrator, foreignTarget), "P0002")
    await expectError(() => remove(administrator, target), "55000")
    for (const id of [target, rollbackTarget]) {
      await run("service_role", "select public.admin_move_employee_to_trash($1,$2,$3)", [administrator, id, `${id}@example.test`])
    }
    await expectError(() => remove(administrator, target, "wrong@example.test"), "22023")
    // Protect another administrator even if a legacy/manual operation trashed it.
    await database.query(`insert into public.user_roles(organization_id,user_id,role_id)
      select $1,$2,id from public.roles where organization_id=$1 and code='administrator'`, [org, rollbackTarget])
    await expectError(() => remove(administrator, rollbackTarget), "42501")
    await database.query("delete from public.user_roles where user_id=$1", [rollbackTarget])

    const before = (await database.query("select purge_after_at from public.profiles where id=$1", [rollbackTarget])).rows[0].purge_after_at
    await database.exec(`create function auth.reject_employee_delete_test() returns trigger language plpgsql as $$
      begin if old.id='${rollbackTarget}'::uuid then raise exception 'Simulated Auth dependency failure'; end if; return old; end $$;
      create trigger reject_employee_delete_test before delete on auth.users for each row execute function auth.reject_employee_delete_test();`)
    await expectError(() => remove(administrator, rollbackTarget), "P0001")
    const after = (await database.query("select purge_after_at,auth_user_id,purged_at from public.profiles where id=$1", [rollbackTarget])).rows[0]
    if (String(before) !== String(after.purge_after_at) || after.auth_user_id !== rollbackTarget || after.purged_at) throw new Error("Failed deletion changed the account or shortened its restore window")
    await database.exec("drop trigger reject_employee_delete_test on auth.users; drop function auth.reject_employee_delete_test()")
    await database.exec(`create function public.reject_employee_finalize_test() returns trigger language plpgsql as $$
      begin if new.id='${rollbackTarget}'::uuid and new.purged_at is not null then raise exception 'Simulated finalization failure'; end if; return new; end $$;
      create trigger reject_employee_finalize_test before update on public.profiles for each row execute function public.reject_employee_finalize_test();`)
    await expectError(() => remove(administrator, rollbackTarget), "P0001")
    const rolledBack = (await database.query(`select p.auth_user_id,p.purge_after_at,p.purged_at,
      (select count(*)::int from auth.users where id=p.id) as auth_count
      from public.profiles p where p.id=$1`, [rollbackTarget])).rows[0]
    if (rolledBack.auth_count !== 1 || rolledBack.auth_user_id !== rollbackTarget || rolledBack.purged_at || String(before) !== String(rolledBack.purge_after_at)) {
      throw new Error("Profile finalization failure did not roll back the Auth deletion")
    }
    await database.exec("drop trigger reject_employee_finalize_test on public.profiles; drop function public.reject_employee_finalize_test()")
    await remove(administrator, rollbackTarget)

    await remove(administrator, target)
    await remove(administrator, target)
    const state = (await database.query(`select p.display_name,p.auth_user_id,p.purged_at,
      (select count(*)::int from auth.users where id=p.id) as auth_count,
      (select count(*)::int from public.user_roles where user_id=p.id) as role_count,
      (select count(*)::int from public.task_assignees where user_id=p.id) as assignments,
      (select count(*)::int from public.comments where author_id=p.id) as comments,
      (select count(*)::int from public.activity_logs where entity_id=p.id and action='EMPLOYEE_PERMANENTLY_DELETED') as audits
      from public.profiles p where p.id=$1`, [target])).rows[0]
    if (state.display_name !== "Deleted employee" || state.auth_user_id || !state.purged_at
      || state.auth_count !== 0 || state.role_count !== 0 || state.assignments !== 1 || state.comments !== 1 || state.audits !== 1) {
      throw new Error(`Permanent employee deletion lost history or was not idempotent: ${JSON.stringify(state)}`)
    }
    // Existing 30-day purge and restore RPCs are left unchanged by the migration.
    console.log("Employee permanent deletion verified: service-only, administrator/org/Trash/confirmation guards, atomic rollback, history preservation, safe retry.")
  } finally {
    await database.exec("rollback")
  }
}

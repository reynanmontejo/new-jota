import fs from "node:fs/promises"
import assert from "node:assert/strict"

export async function validateDailyWorkReports(database, asUser, { employee, otherEmployee, supervisor, foreignSupervisor }) {
  await database.exec(await fs.readFile("supabase/migrations/202611050006_daily_work_report_notification.sql", "utf8"))
  const sql = await fs.readFile("supabase/migrations/202611050007_daily_work_reports.sql", "utf8")
  await database.exec(sql); await database.exec(sql)
  const day = "2026-01-05"
  const entry = { id: "a0000000-0000-4000-8000-000000000001", activity: "Prepared graphics", start: "09:00", end: "10:00", progress: 50, remarks: "Continue tomorrow", nextDay: false, sourceId: null }
  const call = (actor, text, args = []) => asUser(actor, () => database.query(text, args))
  const save = (actor, rows, revision, request, recipient = supervisor) => call(actor, "select (public.daily_work_report_save($1,$2::jsonb,$3,$4,$5)).*", [day, JSON.stringify(rows), recipient, revision, request])
  const key = "a0000000-0000-4000-8000-000000000010"
  let r = (await save(employee, [entry], 0, key)).rows[0]
  assert.equal(r.revision, 1)
  assert.equal((await save(employee, [entry], 0, key)).rows[0].revision, 1, "Retry created another revision")
  await assert.rejects(save(employee, [{ ...entry, activity: "Different" }], 0, key), { code: "22023" })
  await assert.rejects(save(employee, [entry], 0, "a0000000-0000-4000-8000-000000000011"), { code: "40001" })
  assert.equal((await call(supervisor, "select * from public.daily_work_reports where id=$1", [r.id])).rows.length, 0)
  assert.equal((await call(otherEmployee, "select * from public.daily_work_reports where id=$1", [r.id])).rows.length, 0)
  await assert.rejects(call(employee, "update public.daily_work_reports set entries='[]' where id=$1", [r.id]), { code: "42501" })
  await assert.rejects(save(employee, [{ id: entry.id }], 1, "a0000000-0000-4000-8000-000000000012"), { code: "22023" })
  await assert.rejects(save(employee, [{ ...entry, progress: -1 }], 1, "a0000000-0000-4000-8000-000000000013"), { code: "22023" })
  await assert.rejects(save(employee, [entry, entry], 1, "a0000000-0000-4000-8000-000000000014"), { code: "22023" })
  await assert.rejects(save(employee, [entry], 1, "a0000000-0000-4000-8000-000000000015", foreignSupervisor), { code: "42501" })
  const tasksBefore = (await database.query("select id,status from public.tasks order by id")).rows
  const visibleTask = (await call(employee, "select id from public.tasks where deleted_at is null and archived_at is null limit 1")).rows[0]
  assert(visibleTask, "Need an accessible task to verify activity attribution")
  const org = (await database.query("select organization_id from public.profiles where id=$1", [employee])).rows[0].organization_id
  const ownEvent = "a0000000-0000-4000-8000-000000000050", otherEvent = "a0000000-0000-4000-8000-000000000051"
  for (const [id, actor] of [[ownEvent, employee], [otherEvent, supervisor]]) await database.query("insert into public.activity_logs(id,organization_id,actor_id,entity_type,entity_id,action,metadata,created_at) values($1,$2,$3,'task',$4,'TASK_STATUS_CHANGED','{\"to\":\"in_progress\"}',($5::date + time '12:00') at time zone (select timezone from public.organizations where id=$2))", [id,org,actor,visibleTask.id,day])
  const suggestions = (await call(employee, "select * from public.daily_work_report_suggestions($1)", [day])).rows
  assert(suggestions.some(s => s.id === ownEvent))
  assert(!suggestions.some(s => s.id === otherEvent))
  await assert.rejects(save(employee, [{ ...entry, sourceId: otherEvent }], 1, "a0000000-0000-4000-8000-000000000052"), { code: "42501" })
  await assert.rejects(save(employee, [{ ...entry, sourceId: ownEvent }, { ...entry, id: otherEvent, sourceId: ownEvent }], 1, "a0000000-0000-4000-8000-000000000053"), { code: "22023" })
  const submitKey = "a0000000-0000-4000-8000-000000000016"
  const submit = (actor, request = submitKey, revision = r.revision) => call(actor, "select public.daily_work_report_submit($1,$2,$3) as id", [r.id, revision, request])
  const version = (await submit(employee)).rows[0].id
  assert.equal((await submit(employee)).rows[0].id, version)
  assert.equal((await call(supervisor, "select entries from public.daily_work_report_versions where id=$1", [version])).rows.length, 1)
  assert.equal((await call(otherEmployee, "select * from public.daily_work_report_versions where id=$1", [version])).rows.length, 0)
  assert.equal((await call(foreignSupervisor, "select * from public.daily_work_report_versions where id=$1", [version])).rows.length, 0)
  await assert.rejects(call(employee, "select public.daily_work_report_check($1)", [version]), { code: "42501" })
  await assert.rejects(call(otherEmployee, "select public.daily_work_report_check($1)", [version]), { code: "42501" })
  await call(supervisor, "select public.daily_work_report_check($1)", [version])
  await call(supervisor, "select public.daily_work_report_check($1)", [version])
  const checked = (await database.query("select checked_at from public.daily_work_report_versions where id=$1", [version])).rows[0].checked_at
  assert(checked)
  await assert.rejects(save(employee, [entry], 2, "a0000000-0000-4000-8000-000000000017"), { code: "23514" })
  r = (await call(employee, "select (public.daily_work_report_correct($1,2)).*", [r.id])).rows[0]
  const correction = { ...entry, activity: "Prepared and revised graphics", progress: 100 }
  r = (await save(employee, [correction], r.revision, "a0000000-0000-4000-8000-000000000018")).rows[0]
  const second = (await submit(employee, "a0000000-0000-4000-8000-000000000019")).rows[0].id
  assert.notEqual(second, version)
  const originals = (await database.query("select entries,checked_at,is_latest from public.daily_work_report_versions where id=$1", [version])).rows[0]
  assert.equal(originals.entries[0].activity, entry.activity)
  assert.equal(originals.checked_at.getTime(), checked.getTime())
  assert.equal(originals.is_latest, false)
  await assert.rejects(call(supervisor, "select public.daily_work_report_check($1)", [version]), { code: "40001" })
  assert.equal((await database.query("select checked_at from public.daily_work_report_versions where id=$1", [second])).rows[0].checked_at, null)
  assert.equal((await database.query("select count(*)::int as n from public.notifications where type='daily_work_report_submitted' and entity_id in ($1,$2)", [version, second])).rows[0].n, 2)
  await assert.rejects(call(supervisor, "update public.daily_work_report_versions set entries='[]' where id=$1", [second]), { code: "42501" })
  await database.query("update public.profiles set status='inactive',deactivated_at=now() where id=$1", [supervisor])
  assert.equal((await call(supervisor, "select * from public.daily_work_report_versions where id=$1", [second])).rows.length, 0)
  await assert.rejects(call(supervisor, "select public.daily_work_report_check($1)", [second]), { code: "42501" })
  await database.query("update public.profiles set status='active',deactivated_at=null where id=$1", [supervisor])
  let invalid = (await save(otherEmployee, [{ ...entry, start: "", progress: null }], 0, "a0000000-0000-4000-8000-000000000060")).rows[0]
  await assert.rejects(call(otherEmployee, "select public.daily_work_report_submit($1,$2,$3)", [invalid.id,invalid.revision,"a0000000-0000-4000-8000-000000000061"]), { code: "22023" })
  invalid = (await save(otherEmployee, [{ ...entry, start: "23:00", end: "01:00" }], invalid.revision, "a0000000-0000-4000-8000-000000000062")).rows[0]
  await assert.rejects(call(otherEmployee, "select public.daily_work_report_submit($1,$2,$3)", [invalid.id,invalid.revision,"a0000000-0000-4000-8000-000000000063"]), { code: "22023" })
  invalid = (await save(otherEmployee, [{ ...entry, start: "23:00", end: "01:00", nextDay: true }], invalid.revision, "a0000000-0000-4000-8000-000000000064")).rows[0]
  await call(otherEmployee, "select public.daily_work_report_submit($1,$2,$3)", [invalid.id,invalid.revision,"a0000000-0000-4000-8000-000000000065"])
  await assert.rejects(call(employee, "select public.daily_work_report_save('2099-01-01',$1::jsonb,$2,0,$3)", [JSON.stringify([entry]),supervisor,"a0000000-0000-4000-8000-000000000066"]), { code: "22023" })
  assert.deepEqual((await database.query("select id,status from public.tasks order by id")).rows, tasksBefore)
  assert.equal((await database.query("select has_function_privilege('anon','public.daily_work_report_submit(uuid,integer,uuid)','execute') as allowed")).rows[0].allowed, false)
  await database.exec(sql)
  assert.equal((await database.query("select entries from public.daily_work_report_versions where id=$1", [second])).rows[0].entries[0].activity, correction.activity)
  console.log("Daily work reports verified: private drafts, retry-safe saves/submissions, stale edits, time/progress validation, tenant/recipient isolation, immutable versions, corrections and version-specific checks, preserved task state, deduplicated notifications and additive reapplication.")
}

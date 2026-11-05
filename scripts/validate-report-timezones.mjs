import fs from "node:fs/promises"
import assert from "node:assert/strict"

export async function validateReportTimezones(database, asUser, { employee, supervisor }) {
  const sql = await fs.readFile("supabase/migrations/202611050008_daily_report_profile_timezone.sql", "utf8")
  const before = (await database.query("select id,report_date,timezone,entries from public.daily_work_reports order by id")).rows
  const versionsBefore = (await database.query("select id,timezone,entries,checked_at from public.daily_work_report_versions order by id")).rows
  await database.exec(sql); await database.exec(sql)
  assert.deepEqual((await database.query("select id,report_date,timezone,entries from public.daily_work_reports order by id")).rows, before)
  assert.deepEqual((await database.query("select id,timezone,entries,checked_at from public.daily_work_report_versions order by id")).rows, versionsBefore)
  const profile = (await database.query("select organization_id,timezone from public.profiles where id=$1", [employee])).rows[0]
  const org = (await database.query("select timezone from public.organizations where id=$1", [profile.organization_id])).rows[0]
  const call = (query, params = []) => asUser(employee, () => database.query(query, params))
  const calendar = async () => (await call("select public.daily_work_report_calendar() as c")).rows[0].c
  const day = "2026-02-10"
  const entry = { id: "f0000000-0000-4000-8000-000000000001", activity: "Timezone verification", start: "09:00", end: "10:00", progress: 100, remarks: "", nextDay: false, sourceId: null }
  const save = (date, revision, key) => call("select (public.daily_work_report_save($1,$2::jsonb,$3,$4,$5)).*", [date,JSON.stringify([entry]),supervisor,revision,key])
  try {
    await database.query("update public.organizations set timezone='America/Los_Angeles' where id=$1", [profile.organization_id])
    await database.query("update public.profiles set timezone='Asia/Manila' where id=$1", [employee])
    const personal = await calendar()
    assert.equal(personal.timezone, "Asia/Manila")
    assert.equal(personal.today, (await database.query("select (now() at time zone 'Asia/Manila')::date::text as day")).rows[0].day)
    const task = (await call("select id from public.tasks where deleted_at is null and archived_at is null limit 1")).rows[0]
    assert(task)
    const event = "f0000000-0000-4000-8000-000000000002"
    await database.query("insert into public.activity_logs(id,organization_id,actor_id,entity_type,entity_id,action,metadata,created_at) values($1,$2,$3,'task',$4,'TASK_STATUS_CHANGED','{\"to\":\"in_progress\"}','2026-02-09T18:00:00Z')", [event,profile.organization_id,employee,task.id])
    assert((await call("select id from public.daily_work_report_suggestions($1)", [day])).rows.some(item => item.id===event), "New report suggestions ignored the Profile date boundary")
    let report = (await save(day,0,"f0000000-0000-4000-8000-000000000003")).rows[0]
    assert.equal(report.timezone, "Asia/Manila")
    await database.query("update public.profiles set timezone='America/New_York' where id=$1", [employee])
    assert.equal((await calendar()).timezone, "America/New_York")
    report = (await save(day,report.revision,"f0000000-0000-4000-8000-000000000004")).rows[0]
    assert.equal(report.timezone, "Asia/Manila", "Profile changes reinterpreted saved report times")
    assert((await call("select id from public.daily_work_report_suggestions($1)", [day])).rows.some(item => item.id===event), "Saved report suggestions lost their original date boundary")
    const next = (await save("2026-02-11",0,"f0000000-0000-4000-8000-000000000005")).rows[0]
    assert.equal(next.timezone, "America/New_York")
    await database.query("update public.profiles set timezone=null where id=$1", [employee])
    assert.equal((await calendar()).timezone, "America/Los_Angeles", "Missing preference did not use the workspace fallback")
    await database.query("update public.profiles set timezone='Invalid/Zone' where id=$1", [employee])
    assert.equal((await calendar()).timezone, "Asia/Manila", "Invalid-zone fallback differs from Profile")
    await database.query("update public.profiles set status='inactive',deactivated_at=now() where id=$1", [employee])
    await assert.rejects(calendar(), { code: "42501" })
    await database.query("update public.profiles set status='active',deactivated_at=null where id=$1", [employee])
    assert.equal((await database.query("select has_function_privilege('anon','public.daily_work_report_calendar()','execute') as allowed")).rows[0].allowed, false)
    assert.equal((await database.query("select has_function_privilege('authenticated','private.daily_work_report_timezone(uuid)','execute') as allowed")).rows[0].allowed, false)
    await database.exec(sql)
    assert.equal((await database.query("select timezone from public.daily_work_reports where id=$1", [report.id])).rows[0].timezone, "Asia/Manila")
  } finally {
    await database.query("update public.profiles set timezone=$1,status='active',deactivated_at=null where id=$2", [profile.timezone,employee])
    await database.query("update public.organizations set timezone=$1 where id=$2", [org.timezone,profile.organization_id])
  }
  console.log("Report time zones verified: Profile calendar and date boundaries, workspace fallback, new-report snapshot, saved-report/version preservation, active-account guards and idempotent rollout.")
}

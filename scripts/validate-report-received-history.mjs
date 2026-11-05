import fs from "node:fs/promises"
import assert from "node:assert/strict"

export async function validateReportReceivedHistory(database, asUser, { employee, supervisor, administrator, outsider, foreignSupervisor }) {
  const sql = await fs.readFile("supabase/migrations/202611050009_daily_report_received_history.sql", "utf8")
  const payloads = (await database.query("select id,entries,recipient_id,checked_at from public.daily_work_report_versions order by id")).rows
  await database.exec(sql); await database.exec(sql)
  assert.deepEqual((await database.query("select id,entries,recipient_id,checked_at from public.daily_work_report_versions order by id")).rows, payloads)
  const call = (actor, query, params=[]) => asUser(actor, () => database.query(query, params))
  const report = async () => (await database.query("select * from public.daily_work_reports where author_id=$1 and report_date='2026-01-05'", [employee])).rows[0]
  const inbox = (actor, id) => call(actor, "select * from public.daily_work_report_received where report_id=$1", [id])
  let r = await report()
  assert(r)
  const previous = (await inbox(supervisor,r.id)).rows
  assert.equal(previous.length,1)
  const oldVersion = previous[0].id
  assert.equal((await inbox(employee,r.id)).rows.length,0)
  assert.equal((await inbox(outsider,r.id)).rows.length,0)
  assert.equal((await inbox(foreignSupervisor,r.id)).rows.length,0)
  const reroute = async (recipient,key) => {
    r = (await call(employee,"select (public.daily_work_report_correct($1,$2)).*",[r.id,r.revision])).rows[0]
    r = (await call(employee,"select (public.daily_work_report_save($1,$2::jsonb,$3,$4,$5)).*",[r.report_date,JSON.stringify(r.entries),recipient,r.revision,key])).rows[0]
    const id = (await call(employee,"select public.daily_work_report_submit($1,$2,$3) as id",[r.id,r.revision,key])).rows[0].id
    r = await report()
    return id
  }
  const second = await reroute(administrator,"f0000000-0000-4000-8000-000000000070")
  const oldInbox = (await inbox(supervisor,r.id)).rows
  assert.equal(oldInbox.length,1)
  assert.equal(oldInbox[0].id,oldVersion,"Recipient change hid a previously received report")
  assert.equal(oldInbox[0].is_latest,false)
  assert.equal((await inbox(administrator,r.id)).rows[0].id,second)
  await assert.rejects(call(supervisor,"select public.daily_work_report_check($1)",[oldVersion]),{code:"40001"})
  await call(administrator,"select public.daily_work_report_check($1)",[second])
  const third = await reroute(supervisor,"f0000000-0000-4000-8000-000000000071")
  const current = (await inbox(supervisor,r.id)).rows
  assert.equal(current.length,1,"Same recipient received duplicate report rows")
  assert.equal(current[0].id,third)
  assert.equal(current[0].is_latest,true)
  const retained = (await inbox(administrator,r.id)).rows[0]
  assert.equal(retained.id,second)
  assert(retained.checked_at,"Earlier recipient lost their check acknowledgment")
  assert.equal(retained.is_latest,false)
  await database.query("update public.profiles set status='inactive',deactivated_at=now() where id=$1",[administrator])
  assert.equal((await inbox(administrator,r.id)).rows.length,0)
  await database.query("update public.profiles set status='active',deactivated_at=null where id=$1",[administrator])
  assert.equal((await database.query("select has_table_privilege('anon','public.daily_work_report_received','select') as allowed")).rows[0].allowed,false)
  assert.equal((await database.query("select has_table_privilege('authenticated','public.daily_work_report_received','update') as allowed")).rows[0].allowed,false)
  assert((await database.query("select reloptions from pg_class where oid='public.daily_work_report_received'::regclass")).rows[0].reloptions.includes("security_invoker=true"))
  await database.exec(sql)
  assert.equal((await inbox(supervisor,r.id)).rows[0].id,third)
  console.log("Received report history verified: latest per recipient, repeated handoffs, preserved payloads/checks, read-only earlier versions, tenant/recipient/role isolation, invoker RLS and idempotent rollout.")
}

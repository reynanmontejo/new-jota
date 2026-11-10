import assert from "node:assert/strict"
import fs from "node:fs/promises"

export async function validateClientDeletion(database, asUser, { administrator, manager, supervisor, foreignAdministrator }) {
  const sql = await fs.readFile("supabase/migrations/202611100001_client_trash_permanent_delete.sql", "utf8")
  const repair = await fs.readFile("supabase/migrations/202611100002_restore_task_purge_prerequisite.sql", "utf8")
  const original = await fs.readFile("supabase/migrations/202611040001_unified_task_trash_retention.sql", "utf8")
  const canonicalHelpers = original.slice(original.indexOf("create or replace function private.purge_trashed_task"), original.indexOf("create or replace function public.workflow_manage_task_trash")).trim()
  const repairedHelpers = repair.slice(repair.indexOf("create or replace function private.purge_trashed_task"), repair.indexOf("notify pgrst")).trim()
  assert.equal(repairedHelpers.replace(/\r\n/g, "\n"), canonicalHelpers.replace(/\r\n/g, "\n"), "Repair drifted from the existing task cleanup implementation")
  await database.exec(sql)
  const org = (await database.query("select organization_id from public.profiles where id=$1", [administrator])).rows[0].organization_id
  const reject = async (fn, code) => {
    let failed = false
    try { await fn() } catch (error) { failed = true; if (code) assert([code].flat().includes(error.code), `Expected ${code}; received ${error.code}: ${error.message}`) }
    assert(failed, "Client deletion protection did not reject the call")
  }
  const remove = (actor, client, name) => asUser(actor, async () => (await database.query(
    "select public.permanently_delete_client_from_trash($1,$2) as removed", [client, name])).rows[0].removed)
  const name = "Client purge verification"
  const client = (await database.query("insert into public.clients(organization_id,name,slug,created_by) values($1,$2,'client-purge-verification',$3) returning id", [org, name, manager])).rows[0].id
  const neighbor = (await database.query("insert into public.clients(organization_id,name,slug,created_by) values($1,'Keep this client','client-purge-neighbor',$2) returning id", [org, manager])).rows[0].id
  await database.query("insert into public.client_members(organization_id,client_id,user_id,client_role,is_primary) values($1,$2,$3,'account_manager',true)", [org, client, manager])
  const campaign = (await database.query("insert into public.campaigns(organization_id,client_id,name,status,created_by) values($1,$2,'Purge campaign','active',$3) returning id", [org, client, manager])).rows[0].id
  const content = (await database.query("insert into public.content_items(organization_id,client_id,campaign_id,title,platform,content_type,created_by,assigned_to) values($1,$2,$3,'Purge creative','Instagram','Static image',$4,$4) returning id", [org, client, campaign, manager])).rows[0].id
  const task = (await database.query("insert into public.tasks(organization_id,client_id,campaign_id,content_item_id,title,created_by) values($1,$2,$3,$4,'Purge linked task',$5) returning id", [org, client, campaign, content, manager])).rows[0].id
  await database.query("insert into public.task_assignees(organization_id,task_id,user_id,is_primary) values($1,$2,$3,true)", [org, task, manager])
  const file = (await database.query("insert into public.attachments(organization_id,client_id,campaign_id,task_id,provider_file_id,file_name,mime_type,size_bytes,uploaded_by) values($1,$2,$3,$4,'retained-in-drive','creative.png','image/png',100,$5) returning id", [org, client, campaign, task, manager])).rows[0].id
  const version = await asUser(manager, async () => (await database.query("select public.submit_task_for_review($1,array[$2::uuid],'Ready') as id", [task, file])).rows[0].id)
  await asUser(supervisor, () => database.query("select public.review_task_submission($1,'approved',null)", [version]))
  const history = (await database.query("select s.id, v.id as version from public.content_submissions s join public.content_submission_versions v on v.submission_id=s.id where s.content_item_id=$1", [content])).rows[0]
  assert(history, "Purge fixture needs actual approved content history")
  await asUser(manager, () => database.query("select public.send_approved_content_to_client($1)", [content]))
  await asUser(manager, () => database.query("select public.record_external_client_decision($1,'approved',null)", [content]))
  await database.query("insert into public.comments(organization_id,task_id,author_id,body) values($1,$2,$3,'Disposable comment')", [org, task, manager])
  await database.query("insert into public.task_checklist_items(organization_id,task_id,title) values($1,$2,'Disposable checklist')", [org, task])
  const meeting = (await database.query("insert into public.meetings(organization_id,client_id,requested_by,title) values($1,$2,$3,'Disposable meeting') returning id", [org, client, manager])).rows[0].id
  await database.query("insert into public.meeting_participants(organization_id,meeting_id,user_id) values($1,$2,$3)", [org, meeting, manager])
  await database.query("insert into public.client_drive_folders(organization_id,client_id,provider_folder_id) values($1,$2,'drive-folder-remains-external')", [org, client])
  const neighborTask = (await database.query("insert into public.tasks(organization_id,client_id,title,created_by) values($1,$2,'Unrelated task',$3) returning id", [org, neighbor, manager])).rows[0].id

  await reject(() => remove(administrator, client, name), "22023")
  await asUser(supervisor, () => database.query("select public.move_client_to_trash($1)", [client]))
  await reject(() => remove(manager, client, name), "42501")
  await reject(() => remove(supervisor, client, name), "42501")
  await reject(() => remove(foreignAdministrator, client, name), "P0002")
  await reject(() => remove(administrator, client, "Wrong confirmation"), "22023")
  await reject(() => database.query("update public.content_submission_versions set notes='Tampered' where id=$1", [history.version]), "P0001")
  await reject(() => database.query("delete from public.content_submission_version_files where attachment_id=$1", [file]), "P0001")
  await reject(() => database.query("delete from public.content_reviews where submission_version_id=$1", [history.version]), "P0001")

  // Reproduce the live state: the public RPC exists, but its private helper
  // was never installed. The failed call must not partly delete client work.
  await database.exec("drop function private.purge_trashed_task(uuid,uuid,text)")
  await reject(() => remove(administrator, client, name), "42883")
  assert.equal((await database.query("select count(*)::int as n from public.submission_versions where id=$1", [version])).rows[0].n, 1)
  assert.equal((await database.query("select client_handoff_version_id from public.content_items where id=$1", [content])).rows[0].client_handoff_version_id, history.version)
  const snapshot = async () => (await database.query("select coalesce(jsonb_agg(jsonb_build_object('id',id,'deleted_at',deleted_at,'archived_at',archived_at,'trash_expires_at',trash_expires_at) order by id),'[]'::jsonb) as rows from public.tasks")).rows[0].rows
  const beforeRepair = await snapshot()
  const jobsBefore = (await database.query("select coalesce(jsonb_agg(to_jsonb(j) order by jobid),'[]'::jsonb) as jobs from cron.job j")).rows[0].jobs
  await database.exec(repair)
  await database.exec(repair)
  assert.deepEqual(await snapshot(), beforeRepair, "Helper repair changed work or retention dates")
  assert.deepEqual((await database.query("select coalesce(jsonb_agg(to_jsonb(j) order by jobid),'[]'::jsonb) as jobs from cron.job j")).rows[0].jobs, jobsBefore, "Helper repair changed scheduled jobs")
  const rawAccess = (await database.query("select has_function_privilege('authenticated','private.purge_trashed_task(uuid,uuid,text)','EXECUTE') as browser,has_function_privilege('service_role','private.purge_trashed_task(uuid,uuid,text)','EXECUTE') as service")).rows[0]
  assert.equal(rawAccess.browser, false); assert.equal(rawAccess.service, false)

  // Deliberately fail after dependent deletes. Every child and the confirmation
  // state must roll back, including the pending client handoff and file links.
  await database.exec("create table public.client_purge_test_hold(client_id uuid references public.clients(id) on delete restrict)")
  await database.query("insert into public.client_purge_test_hold values($1)", [client])
  await reject(() => remove(administrator, client, name), ["23503", "23001"])
  assert.equal((await database.query("select count(*)::int as n from public.tasks where id=$1", [task])).rows[0].n, 1)
  assert.equal((await database.query("select count(*)::int as n from public.content_submission_versions where id=$1", [history.version])).rows[0].n, 1)
  assert.equal((await database.query("select task_id from public.attachments where id=$1", [file])).rows[0].task_id, task)
  assert.equal((await database.query("select client_handoff_version_id from public.content_items where id=$1", [content])).rows[0].client_handoff_version_id, history.version)
  assert.equal((await database.query("select count(*)::int as n from public.activity_logs where entity_id=$1 and action='CLIENT_PERMANENTLY_DELETED'", [client])).rows[0].n, 0)
  await database.exec("drop table public.client_purge_test_hold")
  await database.exec(sql)
  assert.equal(await remove(administrator, client, name), true)
  assert.equal(await remove(administrator, client, name), false)
  for (const [table, column, id] of [
    ["clients", "id", client], ["campaigns", "id", campaign], ["content_items", "id", content],
    ["tasks", "id", task], ["comments", "task_id", task], ["task_checklist_items", "task_id", task],
    ["task_assignees", "task_id", task], ["reviews", "submission_version_id", version],
    ["submissions", "task_id", task], ["submission_versions", "task_id", task], ["submission_version_files", "task_id", task],
    ["attachments", "id", file], ["content_submissions", "id", history.id], ["content_submission_versions", "id", history.version],
    ["content_submission_version_files", "submission_version_id", history.version], ["content_reviews", "submission_version_id", history.version],
    ["meetings", "id", meeting], ["meeting_participants", "meeting_id", meeting], ["client_members", "client_id", client], ["client_drive_folders", "client_id", client],
  ]) assert.equal((await database.query(`select count(*)::int as n from public.${table} where ${column}=$1`, [id])).rows[0].n, 0, `${table} was not purged`)
  assert.equal((await database.query("select count(*)::int as n from public.clients where id=$1", [neighbor])).rows[0].n, 1)
  assert.equal((await database.query("select count(*)::int as n from public.tasks where id=$1", [neighborTask])).rows[0].n, 1)
  assert.equal((await database.query("select count(*)::int as n from public.activity_logs where entity_id=$1 and action='CLIENT_PERMANENTLY_DELETED'", [client])).rows[0].n, 1)
  const acl = (await database.query("select has_function_privilege('anon','public.permanently_delete_client_from_trash(uuid,text)','execute') as anon, has_function_privilege('authenticated','private.guard_content_history_client_purge()','execute') as raw")).rows[0]
  assert.equal(acl.anon, false); assert.equal(acl.raw, false)
  console.log("Client permanent deletion verified: administrator and tenant scope, typed name, Trash-only, immutable history, missing-helper reproduction and safe repair without retention/job changes, full linked purge, atomic failure rollback, unrelated-client preservation and idempotent retry/rollout.")
}

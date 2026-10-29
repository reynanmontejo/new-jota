import fs from "node:fs/promises"

export async function validateTaskTrash(database, asUser, { manager, supervisor, outsider }) {
  const org = "10000000-0000-0000-0000-000000000001"
  const client = "30000000-0000-0000-0000-000000000002"
  const campaign = "40000000-0000-0000-0000-000000000002"
  const createTask = async (owner, extra = "", id = null) => (await database.query(`insert into public.tasks
    (${id ? "id," : ""}organization_id, title, created_by ${extra ? "," + extra.split("|")[0] : ""})
    values (${id ? `'${id}',` : ""}'${org}', 'Trash verification task', '${owner}' ${extra ? "," + extra.split("|")[1] : ""}) returning id`)).rows[0].id
  const legacy = await createTask(manager, "status,completed_at,archived_at|'completed',now(),now() - interval '90 days'")
  const sql = (await fs.readFile("supabase/migrations/202611040001_unified_task_trash_retention.sql", "utf8"))
    .replace(/create extension if not exists pg_cron with schema pg_catalog;\s*/i, "")
  await database.exec(sql)
  const moved = (await database.query(`select deleted_at, archived_at, trash_expires_at from public.tasks where id = '${legacy}'`)).rows[0]
  if (!moved.deleted_at || moved.archived_at || Date.parse(moved.trash_expires_at) < Date.now() + 29 * 86_400_000) throw new Error("Legacy archives did not receive a fresh restore window")
  await database.exec(sql)
  const retried = (await database.query(`select trash_expires_at from public.tasks where id = '${legacy}'`)).rows[0]
  if (String(retried.trash_expires_at) !== String(moved.trash_expires_at)) throw new Error("Retry extended the Trash expiry")
  const expectError = async (actor, query, code) => {
    try { await asUser(actor, () => database.query(query)) }
    catch (error) { if (error?.code === code) return; throw error }
    throw new Error(`Expected ${code} for Task Trash protection`)
  }
  const manage = (actor, ids, action) => asUser(actor, async () => (await database.query("select public.workflow_manage_task_trash($1::uuid[], $2) as count", [ids, action])).rows[0].count)
  await asUser(manager, () => database.query(`select public.workflow_restore_task_from_archive('${legacy}')`))
  if ((await database.query(`select deleted_at from public.tasks where id = '${legacy}'`)).rows[0].deleted_at) throw new Error("Legacy restore did not use Trash")
  await asUser(manager, () => database.query(`select public.workflow_archive_completed_task('${legacy}')`))
  if (!(await database.query(`select deleted_at from public.tasks where id = '${legacy}'`)).rows[0].deleted_at) throw new Error("Legacy archive action still bypasses Trash")
  const list = await asUser(manager, () => database.query("select * from public.workflow_list_task_trash_with_retention()"))
  if (!list.rows.some((row) => row.task_id === legacy && row.expires_at)) throw new Error("Retention reader lost a migrated task")
  await expectError(outsider, `select public.workflow_manage_task_trash(array['${legacy}'::uuid], 'delete')`, "42501")
  if (await manage(manager, [legacy], "delete") !== 1 || await manage(manager, [legacy], "delete") !== 0) throw new Error("Permanent deletion was not safely retryable")

  const owned = await createTask(outsider, "deleted_at|now()", "a0000000-0000-4000-8000-000000000001")
  const foreign = await createTask(manager, "deleted_at|now()", "a0000000-0000-4000-8000-000000000002")
  await expectError(outsider, `select public.workflow_manage_task_trash(array['${owned}'::uuid,'${foreign}'::uuid], 'delete')`, "42501")
  if ((await database.query(`select count(*)::int as count from public.tasks where id in ('${owned}','${foreign}')`)).rows[0].count !== 2) throw new Error("Rejected bulk deletion partially removed tasks")
  if (await manage(supervisor, [owned, foreign], "restore") !== 2) throw new Error("Restore all did not restore eligible tasks")
  await expectError(supervisor, `select public.workflow_manage_task_trash(array['${owned}'::uuid], 'delete')`, "22023")
  await asUser(supervisor, () => database.query(`select public.workflow_trash_task_for_current_user('${owned}')`))
  await asUser(supervisor, () => database.query(`select public.workflow_trash_task_for_current_user('${foreign}')`))
  await manage(supervisor, [owned, foreign], "delete")

  const freshRestore = await createTask(manager, "deleted_at|now()", "a0000000-0000-4000-8000-000000000003")
  const expiredRestore = await createTask(manager, "deleted_at|now() - interval '31 days'", "a0000000-0000-4000-8000-000000000004")
  await expectError(manager, `select public.workflow_manage_task_trash(array['${freshRestore}'::uuid,'${expiredRestore}'::uuid], 'restore')`, "22023")
  if (!(await database.query(`select deleted_at from public.tasks where id = '${freshRestore}'`)).rows[0].deleted_at) throw new Error("Expired bulk restore partially restored other tasks")
  await manage(manager, [freshRestore, expiredRestore], "delete")

  const expired = await createTask(manager, "deleted_at|now() - interval '31 days'")
  await expectError(manager, `select public.workflow_restore_task_from_trash('${expired}')`, "22023")
  await expectError(outsider, "select public.purge_expired_task_trash()", "42501")
  const purge = (await database.query("select public.purge_expired_task_trash() as result")).rows[0].result
  if (purge.deleted !== 1 || purge.failed !== 0) throw new Error("Scheduled cleanup did not remove only expired tasks")
  if ((await database.query(`select count(*)::int as count from cron.job where jobname = 'purge-expired-task-trash'`)).rows[0].count !== 1) throw new Error("Trash cleanup cron is missing or duplicated")

  // Approve linked work through the real RPCs. Purging its task must preserve
  // the client's approved content snapshot and allow the same asset to download.
  const content = (await database.query(`insert into public.content_items (organization_id, client_id, campaign_id, title, platform, content_type, created_by)
    values ('${org}','${client}','${campaign}','Retained approved content','Instagram','Static image','${manager}') returning id`)).rows[0].id
  const linked = await createTask(manager, `client_id,campaign_id,content_item_id|'${client}','${campaign}','${content}'`)
  await database.query(`insert into public.task_assignees (organization_id, task_id, user_id, is_primary) values ('${org}','${linked}','${manager}',true)`)
  const file = (await database.query(`insert into public.attachments (organization_id, client_id, campaign_id, task_id, provider_file_id, file_name, mime_type, size_bytes, uploaded_by)
    values ('${org}','${client}','${campaign}','${linked}','trash-retained-asset','final.png','image/png',100,'${manager}') returning id`)).rows[0].id
  const version = await asUser(manager, async () => (await database.query(`select public.submit_task_for_review('${linked}', array['${file}'::uuid], 'Ready') as id`)).rows[0].id)
  await asUser(supervisor, () => database.query(`select public.review_task_submission('${version}', 'approved', null)`))
  await expectError(supervisor, `delete from public.reviews where submission_version_id = '${version}'`, "42501")
  await asUser(manager, () => database.query(`select public.send_approved_content_to_client('${content}')`))
  await asUser(manager, () => database.query(`select public.record_external_client_decision('${content}', 'approved', null)`))
  await asUser(supervisor, () => database.query(`select public.workflow_update_task_status('${linked}', 'completed')`))
  await database.query(`insert into public.comments (organization_id, task_id, author_id, body) values ('${org}','${linked}','${manager}','Disposable task comment')`)
  await asUser(manager, () => database.query(`select public.workflow_trash_task_for_current_user('${linked}')`))
  await manage(manager, [linked], "delete")
  const retained = (await database.query(`select a.task_id, a.content_item_id from public.attachments a
    join public.content_submission_version_files f on f.attachment_id = a.id where a.id = '${file}'`)).rows[0]
  if (!retained || retained.task_id || retained.content_item_id !== content) throw new Error("Task purge lost the approved content asset or leaked it into general files")
  if ((await database.query(`select count(*)::int as count from public.comments where task_id = '${linked}'`)).rows[0].count !== 0) throw new Error("Task purge retained comments")
  if ((await database.query(`select count(*)::int as count from public.submission_versions where task_id = '${linked}'`)).rows[0].count !== 0) throw new Error("Task purge retained task submission history")
  let immutable = false
  try { await database.query(`delete from public.content_submission_version_files where attachment_id = '${file}'`) }
  catch { immutable = true }
  if (!immutable) throw new Error("Content snapshot immutability was weakened")
  const grants = (await database.query(`select has_function_privilege('authenticated','private.purge_trashed_task(uuid,uuid,text)','execute') as raw,
    has_function_privilege('authenticated','public.purge_expired_task_trash()','execute') as job`)).rows[0]
  if (grants.raw || grants.job) throw new Error("A browser can bypass the scoped Trash RPC")
}

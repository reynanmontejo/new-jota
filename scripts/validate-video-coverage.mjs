import fs from "node:fs/promises"
import assert from "node:assert/strict"

export async function validateVideoCoverage(database, asUser, { manager, supervisor, administrator, editor, outsider, foreignAdministrator }) {
  const org = "10000000-0000-0000-0000-000000000001"
  const client = "30000000-0000-0000-0000-000000000002"
  const campaign = "40000000-0000-0000-0000-000000000002"
  const roleSql = await fs.readFile("supabase/migrations/202611050001_video_backup_role.sql", "utf8")
  const sql = await fs.readFile("supabase/migrations/202611050002_video_production_coverage.sql", "utf8")
  await database.exec(roleSql); await database.exec(sql)
  await database.exec(roleSql); await database.exec(sql)
  const call = (actor, query, params = []) => asUser(actor, () => database.query(query, params))
  const reject = async (actor, query, params, code) => {
    try { await call(actor, query, params) } catch (error) { assert.equal(error.code, code, error.message); return }
    throw new Error(`Expected ${code}: ${query}`)
  }
  const team = "select public.set_client_video_team($1, $2, $3)"
  await reject(outsider, team, [client, editor, supervisor], "42501")
  await reject(foreignAdministrator, team, [client, editor, supervisor], "42501")
  await reject(manager, team, [client, editor, editor], "22023")
  await reject(manager, team, [client, foreignAdministrator, null], "22023")
  await database.query("update public.profiles set status = 'inactive', deactivated_at = now() where id = $1", [editor])
  await reject(manager, team, [client, editor, supervisor], "22023")
  await database.query("update public.profiles set status = 'active', deactivated_at = null where id = $1", [editor])
  await call(manager, team, [client, editor, supervisor])
  const candidates = (await call(manager, "select * from public.workflow_list_client_video_editor_candidates($1)", [client])).rows
  assert(candidates.some((person) => person.user_id === supervisor), "Supervisor missing from video choices")
  const content = (await call(supervisor, `select public.create_content_tracker_item_for_current_user(
    $1, $2, 'Coverage reel', 'Instagram', 'Reel', 'Synthetic brief', 'planned', null, null, null,
    null, null, null, null, $3) as id`, [client, campaign, supervisor])).rows[0].id
  const beforeImportTasks = (await database.query("select count(*)::int as n from public.tasks")).rows[0].n
  const imported = (await call(supervisor, "select public.import_content_items_for_current_user($1::jsonb) as result", [JSON.stringify([
    { client_id: client, campaign_id: campaign, title: "Supervisor import static", platform: "Instagram", content_type: "Static image", status: "planned", assigned_to: supervisor },
    { client_id: client, campaign_id: campaign, title: "Supervisor import video", platform: "Instagram", content_type: "Reel", status: "planned", assigned_to: supervisor },
  ])])).rows[0].result
  assert.equal(imported.created, 2, "Supervisor content import failed")
  assert.equal((await database.query("select count(*)::int as n from public.tasks")).rows[0].n, beforeImportTasks, "Import created tasks automatically")
  const make = async (actor, owner) => (await call(actor, `select public.workflow_create_task_for_content_with_details(
    $1, 'Produce coverage reel', 'medium', now() + interval '2 days', $2, 'Keep the brief', null, array['Export final']) as id`, [content, owner])).rows[0].id
  const task = await make(manager, editor)
  const owner = async () => (await database.query("select user_id from public.task_assignees where task_id = $1 and is_primary and removed_at is null", [task])).rows[0]?.user_id ?? null
  assert.equal(await owner(), editor)
  assert.equal((await database.query("select requires_review from public.tasks where id = $1", [task])).rows[0].requires_review, true)
  await call(manager, team, [client, supervisor, manager])
  assert.equal(await owner(), editor, "Client-default change reassigned an existing task")
  assert.equal((await call(editor, "select count(*)::int as n from public.clients where id = $1", [client])).rows[0].n, 1, "Replacing a default stranded its active producer")
  await call(manager, "select public.set_client_video_editor($1, $2)", [client, editor])
  assert.equal((await database.query("select user_id from public.client_members where client_id = $1 and client_role = 'video_backup' and removed_at is null", [client])).rows[0].user_id, manager)
  await call(manager, team, [client, editor, supervisor])
  const options = (await call(manager, "select * from public.workflow_list_video_task_assignees($1)", [task])).rows
  assert(options.some((person) => person.user_id === supervisor))
  assert(options.some((person) => person.user_id === manager))
  const unassigned = await make(manager, null)
  assert.equal((await database.query("select count(*)::int as n from public.task_assignees where task_id = $1", [unassigned])).rows[0].n, 0)
  await reject(manager, "select public.workflow_update_task_status($1, 'in_progress')", [task], "42501")
  await call(editor, "select public.workflow_update_task_status($1, 'in_progress')", [task])
  const file = (await database.query(`insert into public.attachments(organization_id, client_id, campaign_id, task_id,
    provider_file_id, file_name, mime_type, size_bytes, uploaded_by) values ($1,$2,$3,$4,'coverage-asset','coverage.mp4','video/mp4',100,$5) returning id`, [org, client, campaign, task, editor])).rows[0].id
  await call(editor, "select public.workflow_add_task_comment($1, 'Keep this handoff note')", [task])
  const reassign = "select public.workflow_reassign_video_task($1, $2, $3, $4)"
  await reject(editor, reassign, [task, supervisor, editor, "Cover this edit"], "42501")
  await reject(foreignAdministrator, reassign, [task, supervisor, editor, "Cover this edit"], "42501")
  await reject(manager, reassign, [task, outsider, editor, "Cover this edit"], "22023")
  await reject(manager, reassign, [task, supervisor, null, "Outdated owner"], "40001")
  const notices = async () => (await database.query("select count(*)::int as n from public.notifications where entity_id = $1 and recipient_id in ($2,$3)", [task, editor, supervisor])).rows[0].n
  const beforeCount = await notices()
  await call(manager, reassign, [task, supervisor, editor, "Primary editor is away"])
  assert.equal(await owner(), supervisor)
  assert.equal((await database.query("select status::text from public.tasks where id = $1", [task])).rows[0].status, "todo")
  assert.equal(await notices(), beforeCount + 2, "Reassignment notices missing or duplicated")
  await call(manager, reassign, [task, supervisor, editor, "Retry after lost response"])
  assert.equal(await notices(), beforeCount + 2, "Retry duplicated notifications")
  assert.equal((await call(supervisor, "select count(*)::int as n from public.attachments where id = $1", [file])).rows[0].n, 1)
  assert.equal((await call(supervisor, "select count(*)::int as n from public.comments where task_id = $1", [task])).rows[0].n, 1)
  assert.equal((await database.query("select assigned_to from public.content_items where id = $1", [content])).rows[0].assigned_to, supervisor)
  await reject(supervisor, "select public.workflow_update_task_status($1, 'completed')", [task], "42501")
  await call(supervisor, "select public.workflow_update_task_status($1, 'in_progress')", [task])
  const version = (await call(supervisor, "select public.submit_task_for_review($1,array[$2::uuid],'Ready for independent review') as id", [task, file])).rows[0].id
  await reject(manager, reassign, [task, editor, supervisor, "Cannot transfer during review"], "22023")
  await reject(supervisor, "select public.review_task_submission($1,'approved',null)", [version], "42501")
  await call(administrator, "select public.review_task_submission($1,'revision_requested','Update the title')", [version])
  await call(manager, reassign, [task, editor, supervisor, "Return revision to primary editor"])
  assert.equal((await database.query("select submitted_by from public.submission_versions where id = $1", [version])).rows[0].submitted_by, supervisor)
  assert.equal((await database.query("select reviewer_id from public.reviews where submission_version_id = $1", [version])).rows[0].reviewer_id, administrator)
  await call(manager, reassign, [task, null, editor, "Pause until coverage is confirmed"])
  assert.equal(await owner(), null)
  await call(manager, reassign, [task, manager, null, "Account Manager covers this edit"])
  await call(manager, "select public.workflow_update_task_status($1, 'in_progress')", [task])
  await call(manager, team, [client, supervisor, null])
  assert.equal((await call(manager, "select count(*)::int as n from public.attachments where id = $1", [file])).rows[0].n, 1)
  assert.equal((await call(editor, "select count(*)::int as n from public.clients where id = $1", [client])).rows[0].n, 0, "Former editor retained client access after all active assignments ended")
  // Static production owned by a supervisor follows the same independent-review gate.
  const staticContent = (await database.query("select id from public.content_items where title = 'Supervisor import static' and organization_id = $1", [org])).rows[0].id
  const staticTask = (await call(supervisor, "select public.workflow_create_task_for_content($1,'Supervisor graphic','medium',now() + interval '1 day',$2) as id", [staticContent, supervisor])).rows[0].id
  await reject(supervisor, "select public.workflow_update_task_status($1, 'completed')", [staticTask], "42501")
  await call(supervisor, "select public.workflow_update_task_status($1, 'in_progress')", [staticTask])
  const staticFile = (await database.query(`insert into public.attachments(organization_id, client_id, campaign_id, task_id,
    provider_file_id, file_name, mime_type, size_bytes, uploaded_by) values ($1,$2,$3,$4,'coverage-static','graphic.png','image/png',100,$5) returning id`, [org, client, campaign, staticTask, supervisor])).rows[0].id
  const staticVersion = (await call(supervisor, "select public.submit_task_for_review($1,array[$2::uuid],'Review graphic') as id", [staticTask, staticFile])).rows[0].id
  await reject(supervisor, "select public.review_task_submission($1,'approved',null)", [staticVersion], "42501")
  await call(administrator, "select public.review_task_submission($1,'approved',null)", [staticVersion])
  assert.equal((await database.query("select status::text from public.tasks where id = $1", [staticTask])).rows[0].status, "approved")
  assert.equal((await database.query("select status::text from public.content_items where id = $1", [staticContent])).rows[0].status, "waiting_client")
  const standalone = (await call(supervisor, "select public.workflow_create_task('Supervisor planning',null,null,'medium',now() + interval '1 day',$1) as id", [supervisor])).rows[0].id
  await call(supervisor, "select public.workflow_update_task_status($1, 'completed')", [standalone])
  const grants = (await database.query(`select has_function_privilege('anon','public.workflow_reassign_video_task(uuid,uuid,uuid,text)','execute') as anon,
    has_function_privilege('authenticated','private.can_produce_client_video(uuid,uuid)','execute') as raw`)).rows[0]
  assert.equal(grants.anon, false); assert.equal(grants.raw, false)
  console.log("Video coverage verified: supervisor creation, explicit backup/self/unassigned handoffs, preserved defaults/files/history, stale-owner protection, deduplicated notifications, independent review, unchanged standalone flow.")
}

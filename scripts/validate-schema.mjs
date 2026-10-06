import fs from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"

const migrationPath = "supabase/migrations/202609250001_initial_schema.sql"
const authMigrationPath = "supabase/migrations/202609300001_auth_rls_policies.sql"
const taskMigrationPath = "supabase/migrations/202610010001_persistent_task_workflow.sql"
const employeeMigrationPath = "supabase/migrations/202610020001_employee_account_management.sql"
const profileMigrationPath = "supabase/migrations/202610030001_profile_and_initial_admin.sql"
const employeeTrashMigrationPath = "supabase/migrations/202610040002_employee_account_trash.sql"
const employeeTrashRestoreMigrationPath = "supabase/migrations/202610040003_employee_trash_restore_state.sql"
const contentTrackerMigrationPath = "supabase/migrations/202610050001_content_tracker_management.sql"
const contentImportMigrationPath = "supabase/migrations/202610060001_content_tracker_csv_import.sql"
const campaignManagementMigrationPath = "supabase/migrations/202610070001_campaign_management.sql"
const clientCreationMigrationPath = "supabase/migrations/202610040001_client_creation.sql"
const accountManagerClientOwnershipMigrationPath = "supabase/migrations/202610080001_account_manager_client_ownership.sql"
const clientTrashMigrationPath = "supabase/migrations/202610090001_client_trash_and_status.sql"
const contentWorkflowMigrationPath = "supabase/migrations/202610100001_content_workflow_alignment.sql"
const googleDriveStorageMigrationPath = "supabase/migrations/202610110001_google_drive_private_storage.sql"
const contentItemReviewMigrationPath = "supabase/migrations/202610120001_content_item_review_workflow.sql"
const seedPath = "supabase/seed.sql"

const database = new PGlite()
let migration = await fs.readFile(migrationPath, "utf8")

// PGlite validates PostgreSQL DDL locally but does not bundle Supabase's citext
// extension. Supabase applies the unchanged migration with citext enabled.
migration = migration
  .replace(/create extension if not exists pgcrypto;\s*/i, "")
  .replace(/create extension if not exists citext;\s*/i, "")
  .replace(/\bcitext\b/gi, "text")

await database.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`)
await database.exec(migration)
await database.exec(await fs.readFile(authMigrationPath, "utf8"))
await database.exec(await fs.readFile(profileMigrationPath, "utf8"))
await database.exec(`
  create schema cron;
  create table cron.job (jobid bigint generated always as identity primary key, jobname text not null);
  create function cron.unschedule(p_jobid bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid = p_jobid; return found; end $$;
  create function cron.schedule(p_jobname text, p_schedule text, p_command text) returns bigint language plpgsql as $$
  declare new_job_id bigint;
  begin insert into cron.job(jobname) values (p_jobname) returning jobid into new_job_id; return new_job_id; end $$;
`)

const firstAdministrator = "80000000-0000-0000-0000-000000000010"
await database.exec(`insert into auth.users (id, email) values ('${firstAdministrator}', 'first-admin@example.test')`)
await database.query(`select set_config('request.jwt.claim.sub', '${firstAdministrator}', false)`)
await database.exec("set role authenticated")
try {
  await database.query(`select public.bootstrap_initial_administrator(
    'Bootstrap Workspace', 'bootstrap-workspace', 'America/New_York', 'First Admin', 'Operations Lead'
  )`)
  await database.query(`select public.update_own_profile('First Administrator', 'Marketing Lead', '')`)
} finally {
  await database.exec("reset role")
}
const bootstrappedAdmin = await database.query(`
  select p.display_name, r.code as role, o.name as organization
  from public.profiles p join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id join public.organizations o on o.id = p.organization_id
  where p.id = '${firstAdministrator}'
`)
if (bootstrappedAdmin.rows[0]?.display_name !== "First Administrator"
  || bootstrappedAdmin.rows[0]?.role !== "administrator"
  || bootstrappedAdmin.rows[0]?.organization !== "Bootstrap Workspace") {
  throw new Error("Initial administrator bootstrap or profile update failed")
}

const seed = await fs.readFile(seedPath, "utf8")
await database.exec(seed)
await database.exec(seed)
await database.exec(await fs.readFile(taskMigrationPath, "utf8"))
await database.exec(await fs.readFile(employeeMigrationPath, "utf8"))
let employeeTrashMigration = await fs.readFile(employeeTrashMigrationPath, "utf8")
// PGlite validates the SQL job definition without installing Supabase's
// hosted-only pg_cron extension; the minimal cron schema above captures it.
employeeTrashMigration = employeeTrashMigration.replace(/create extension if not exists pg_cron with schema pg_catalog;\s*/i, "")
await database.exec(employeeTrashMigration)
await database.exec(await fs.readFile(employeeTrashRestoreMigrationPath, "utf8"))
await database.exec(await fs.readFile(contentTrackerMigrationPath, "utf8"))
await database.exec(await fs.readFile(contentImportMigrationPath, "utf8"))
await database.exec(await fs.readFile(campaignManagementMigrationPath, "utf8"))
await database.exec(await fs.readFile(clientCreationMigrationPath, "utf8"))
await database.exec(await fs.readFile(accountManagerClientOwnershipMigrationPath, "utf8"))
await database.exec(await fs.readFile(clientTrashMigrationPath, "utf8"))
await database.exec(await fs.readFile(contentWorkflowMigrationPath, "utf8"))
let googleDriveStorageMigration = await fs.readFile(googleDriveStorageMigrationPath, "utf8")
googleDriveStorageMigration = googleDriveStorageMigration.replace(/\bcitext\b/gi, "text")
await database.exec(googleDriveStorageMigration)
await database.exec(await fs.readFile(contentItemReviewMigrationPath, "utf8"))
const providerSecretAccess = await database.query(`
  select has_table_privilege('authenticated', 'public.google_drive_connections', 'select') as can_read_tokens,
         has_table_privilege('authenticated', 'public.client_drive_folders', 'select') as can_read_folder_map,
         has_table_privilege('service_role', 'public.google_drive_connections', 'select') as service_can_read_tokens
`)

if (providerSecretAccess.rows[0]?.can_read_tokens !== false
  || providerSecretAccess.rows[0]?.can_read_folder_map !== false
  || providerSecretAccess.rows[0]?.service_can_read_tokens !== true) {
  throw new Error(`Google Drive provider data is not restricted to the service role: ${JSON.stringify(providerSecretAccess.rows[0])}`)
}

const employeeOne = "80000000-0000-0000-0000-000000000001"
const employeeTwo = "80000000-0000-0000-0000-000000000002"
const supervisor = "80000000-0000-0000-0000-000000000003"
const administrator = "80000000-0000-0000-0000-000000000004"
await database.exec(`
  insert into auth.users (id) values ('${employeeOne}'), ('${employeeTwo}'), ('${supervisor}'), ('${administrator}');
  insert into public.profiles (id, organization_id, email, display_name, status) values
    ('${employeeOne}', '10000000-0000-0000-0000-000000000001', 'one@example.test', 'Employee One', 'active'),
    ('${employeeTwo}', '10000000-0000-0000-0000-000000000001', 'two@example.test', 'Employee Two', 'active'),
    ('${supervisor}', '10000000-0000-0000-0000-000000000001', 'lead@example.test', 'Team Lead', 'active'),
    ('${administrator}', '10000000-0000-0000-0000-000000000001', 'admin@example.test', 'Org Admin', 'active');
  insert into public.user_roles (organization_id, user_id, role_id) values
    ('10000000-0000-0000-0000-000000000001', '${employeeOne}', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000001', '${employeeTwo}', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000001', '${supervisor}', '20000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000001', '${administrator}', '20000000-0000-0000-0000-000000000003');
  insert into public.client_members (organization_id, client_id, user_id, client_role) values
    ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '${employeeOne}', 'account_manager'),
    ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '${employeeTwo}', 'account_manager');
  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by) values
    ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '${employeeOne}', true, '${supervisor}'),
    ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '${employeeTwo}', true, '${supervisor}'),
    ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '${employeeTwo}', true, '${supervisor}');
  insert into public.task_checklist_items (organization_id, task_id, title, position) values
    ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Test checklist', 0);
`)

const provisionedEmployee = "80000000-0000-0000-0000-000000000005"
await database.exec(`insert into auth.users (id) values ('${provisionedEmployee}')`)
await database.exec("set role service_role")
try {
  await database.query(`select public.admin_provision_employee(
    '${provisionedEmployee}', '${administrator}', 'new@example.test', 'New Employee', 'Designer', 'account_manager'
  )`)
  await database.query(`select public.admin_update_employee(
    '${administrator}', '${provisionedEmployee}', 'New Employee', 'Designer', 'supervisor', 'inactive'
  )`)
} finally {
  await database.exec("reset role")
}
const deactivated = await database.query(`select status::text as status from public.profiles where id = '${provisionedEmployee}'`)
if (deactivated.rows[0]?.status !== "inactive") throw new Error("Employee deactivation failed")
await database.exec("set role service_role")
try {
  await database.query(`select public.admin_update_employee(
    '${administrator}', '${provisionedEmployee}', 'New Employee', 'Designer', 'supervisor', 'active'
  )`)
} finally {
  await database.exec("reset role")
}
const provisionResult = await database.query(`
  select p.status::text as status, r.code::text as role
  from public.profiles p join public.user_roles ur on ur.user_id = p.id
  join public.roles r on r.id = ur.role_id where p.id = '${provisionedEmployee}'
`)
if (provisionResult.rows[0]?.status !== "active" || provisionResult.rows[0]?.role !== "supervisor") {
  throw new Error("Employee account provisioning, role update, or reactivation failed")
}
const authenticatedProvisionGrant = await database.query(`
  select has_function_privilege('authenticated', 'public.admin_provision_employee(uuid,uuid,text,text,text,text)', 'execute') as allowed
`)
if (authenticatedProvisionGrant.rows[0]?.allowed !== false) throw new Error("Authenticated users can call admin provisioning RPC")

async function asUser(userId, callback) {
  await database.query(`select set_config('request.jwt.claim.sub', '${userId}', false)`)
  await database.exec("set role authenticated")
  try {
    return await callback()
  } finally {
    await database.exec("reset role")
  }
}

const reviewFileOne = "90000000-0000-0000-0000-000000000001"
const reviewFileTwo = "90000000-0000-0000-0000-000000000002"
await database.exec(`
  insert into public.attachments (
    id, organization_id, client_id, campaign_id, content_item_id, provider_file_id,
    file_name, mime_type, size_bytes, uploaded_by
  ) values
    ('${reviewFileOne}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'drive-review-one', 'creative-v1.png', 'image/png', 1000, '${employeeOne}');
`)
const submittedVersionOne = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_content_for_review(
    '50000000-0000-0000-0000-000000000001', array['${reviewFileOne}'::uuid], 'Check layout and logo'
  ) as version_id
`)).rows[0]?.version_id)
const reviewQueueForSupervisor = await asUser(supervisor, async () => (await database.query(`
  select count(*)::int as count from public.content_submissions where status = 'submitted'
`)).rows[0]?.count)
const submittedItemStatus = await database.query(`select status::text as status from public.content_items where id = '50000000-0000-0000-0000-000000000001'`)
if (!submittedVersionOne || reviewQueueForSupervisor !== 1 || submittedItemStatus.rows[0]?.status !== "for_review") {
  throw new Error("Content submission did not create a reviewable, queued version")
}
let selfReviewRejected = false
await database.exec(`insert into public.role_permissions (organization_id, role_id, permission_code)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'content.review') on conflict do nothing`)
try {
  await asUser(employeeOne, () => database.query(`select public.review_content_submission('${submittedVersionOne}', 'approved', null)`))
} catch (error) {
  selfReviewRejected = error?.code === "42501"
} finally {
  await database.exec(`delete from public.role_permissions where organization_id = '10000000-0000-0000-0000-000000000001' and role_id = '20000000-0000-0000-0000-000000000001' and permission_code = 'content.review'`)
}
if (!selfReviewRejected) throw new Error("The submitter was allowed to review their own content")
let emptyRevisionFeedbackRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.review_content_submission('${submittedVersionOne}', 'revision_requested', null)`))
} catch (error) {
  emptyRevisionFeedbackRejected = error?.code === "22023"
}
if (!emptyRevisionFeedbackRejected) throw new Error("A revision was allowed without supervisor feedback")
await asUser(supervisor, () => database.query(`select public.review_content_submission('${submittedVersionOne}', 'revision_requested', 'Increase CTA contrast')`))
const revisionItem = await database.query(`select status::text as status, revision_notes from public.content_items where id = '50000000-0000-0000-0000-000000000001'`)
if (revisionItem.rows[0]?.status !== "revision_requested" || revisionItem.rows[0]?.revision_notes !== "Increase CTA contrast") {
  throw new Error("Revision decision did not return feedback to the Account Manager")
}
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, content_item_id, provider_file_id, file_name, mime_type, size_bytes, uploaded_by
) values (
  '${reviewFileTwo}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'drive-review-two', 'creative-v2.png', 'image/png', 2000, '${employeeOne}'
)`)
let staleFileResubmissionRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.submit_content_for_review(
    '50000000-0000-0000-0000-000000000001', array['${reviewFileOne}'::uuid], 'No new version'
  )`))
} catch (error) {
  staleFileResubmissionRejected = error?.code === "22023"
}
if (!staleFileResubmissionRejected) throw new Error("Resubmission was allowed without a new or updated file")
const submittedVersionTwo = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_content_for_review(
    '50000000-0000-0000-0000-000000000001', array['${reviewFileTwo}'::uuid], 'Updated CTA contrast'
  ) as version_id
`)).rows[0]?.version_id)
if (!submittedVersionTwo || submittedVersionTwo === submittedVersionOne) throw new Error("Resubmission did not create a new immutable version")
await asUser(supervisor, () => database.query(`select public.review_content_submission('${submittedVersionTwo}', 'approved', 'Approved')`))
const approvedContent = await database.query(`
  select s.status::text as review_status, ci.status::text as content_status
  from public.content_submissions s join public.content_items ci on ci.id = s.content_item_id
  where ci.id = '50000000-0000-0000-0000-000000000001'
`)
if (approvedContent.rows[0]?.review_status !== "approved" || approvedContent.rows[0]?.content_status !== "in_production") {
  throw new Error("Approval was not persisted or incorrectly marked content as published")
}
let immutableReviewRejected = false
try {
  await database.query(`update public.content_reviews set comment = 'Changed' where submission_version_id = '${submittedVersionOne}'`)
} catch {
  immutableReviewRejected = true
}
if (!immutableReviewRejected) throw new Error("A saved content review decision was mutable")

const employeeOneTasks = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
const employeeTwoTasks = await asUser(employeeTwo, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
const supervisorTasks = await asUser(supervisor, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
if (employeeOneTasks !== 1 || employeeTwoTasks !== 2 || supervisorTasks !== 3) {
  throw new Error(`Task RLS isolation failed: employee=${employeeOneTasks}/${employeeTwoTasks}, supervisor=${supervisorTasks}`)
}
const employeeOneCampaigns = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.campaigns")).rows[0]?.count)
const employeeTwoCampaigns = await asUser(employeeTwo, async () => (await database.query("select count(*)::int as count from public.campaigns")).rows[0]?.count)
if (employeeOneCampaigns !== 1 || employeeTwoCampaigns !== 1) {
  throw new Error(`Campaign RLS isolation failed: employee=${employeeOneCampaigns}/${employeeTwoCampaigns}`)
}

const trackedContentId = await asUser(employeeOne, async () => {
  const created = await database.query(`select public.create_content_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Tracker RPC test post', 'Instagram', 'Carousel', 'Test brief', 'planned', now() + interval '5 days', 'Review first draft', '${employeeOne}'
  ) as id`)
  return created.rows[0]?.id
})
if (typeof trackedContentId !== "string") throw new Error("Content tracker create RPC failed")
await asUser(employeeOne, async () => {
  await database.query(`select public.update_content_item_for_current_user(
    '${trackedContentId}', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Tracker RPC test post', 'Instagram', 'Carousel', 'Test brief', 'in_production', now() + interval '5 days', 'Send for review', 'Please adjust the opening frame', '${employeeOne}'
  )`)
})
const revisedContent = await database.query(`select status::text as status, revision_count, assigned_to from public.content_items where id = '${trackedContentId}'`)
if (revisedContent.rows[0]?.status !== "in_production" || revisedContent.rows[0]?.revision_count !== 1 || revisedContent.rows[0]?.assigned_to !== employeeOne) throw new Error("Content tracker update, assignment, or revision tracking failed")
await asUser(employeeOne, async () => database.query(`select public.archive_content_item_for_current_user('${trackedContentId}')`))
const archivedContent = await database.query(`select deleted_at from public.content_items where id = '${trackedContentId}'`)
if (!archivedContent.rows[0]?.deleted_at) throw new Error("Content tracker archive failed")
const authenticatedContentGrant = await database.query(`
  select has_function_privilege('authenticated', 'public.create_content_item_for_current_user(uuid,uuid,text,text,text,text,public.content_status,timestamptz,text,uuid)', 'execute') as allowed
`)
if (authenticatedContentGrant.rows[0]?.allowed !== true) throw new Error("Authenticated role cannot invoke permission-checked content tracker RPC")
const authenticatedAlignedContentGrant = await database.query(`
  select has_function_privilege('authenticated', 'public.create_content_tracker_item_for_current_user(uuid,uuid,text,text,text,text,public.content_status,date,date,timestamptz,text,text,text,text,uuid)', 'execute') as allowed
`)
if (authenticatedAlignedContentGrant.rows[0]?.allowed !== true) throw new Error("Authenticated role cannot invoke the permission-checked aligned content RPC")
const importRow = {
  client_id: "30000000-0000-0000-0000-000000000001",
  campaign_id: "40000000-0000-0000-0000-000000000001",
  title: "CSV import duplicate test",
  platform: "Instagram",
  content_type: "Static graphic",
  description: "Imported test row",
  status: "for_review",
  work_date: "2026-10-10",
  deadline_at: "2026-10-18",
  publish_at: "2026-10-20T12:00:00.000Z",
  client_approval_status: "pending",
  client_issues: "Waiting on product image",
  revision_count: 2,
  notes: "Imported from the AM weekly tracker",
  next_action: null,
  revision_notes: null,
  assigned_to: employeeOne,
}
const tasksBeforeContentImport = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
const importResult = await asUser(employeeOne, async () => (await database.query(
  "select public.import_content_items_for_current_user($1::jsonb) as result",
  [JSON.stringify([importRow, importRow])],
)).rows[0]?.result)
if (importResult?.created !== 1 || importResult?.duplicates !== 1) throw new Error(`Content CSV import or duplicate detection failed: ${JSON.stringify(importResult)}`)
const secondImportResult = await asUser(employeeOne, async () => (await database.query(
  "select public.import_content_items_for_current_user($1::jsonb) as result",
  [JSON.stringify([importRow])],
)).rows[0]?.result)
if (secondImportResult?.created !== 0 || secondImportResult?.duplicates !== 1) throw new Error("Repeated content CSV import did not skip existing duplicates")
const importedCalendarContent = await asUser(employeeOne, async () => (await database.query(
  "select status::text as status, publish_at, work_date::text as work_date, deadline_at::text as deadline_at, client_approval_status, client_issues, revision_count, notes from public.content_items where title = $1 and client_id = $2",
  [importRow.title, importRow.client_id],
)).rows[0])
if (importedCalendarContent?.status !== "for_review" || !importedCalendarContent?.publish_at
  || importedCalendarContent?.work_date !== "2026-10-10" || importedCalendarContent?.deadline_at !== "2026-10-18"
  || importedCalendarContent?.client_approval_status !== "pending"
  || importedCalendarContent?.client_issues !== "Waiting on product image"
  || importedCalendarContent?.revision_count !== 2
  || importedCalendarContent?.notes !== "Imported from the AM weekly tracker") {
  throw new Error(`Imported content workflow fields were not preserved: ${JSON.stringify(importedCalendarContent)}`)
}
const tasksAfterContentImport = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
if (tasksBeforeContentImport !== tasksAfterContentImport) throw new Error("Content CSV import unexpectedly created tasks")
let crossClientImportRejected = false
try {
  await asUser(employeeOne, () => database.query(
    "select public.import_content_items_for_current_user($1::jsonb)",
    [JSON.stringify([{ ...importRow, client_id: "30000000-0000-0000-0000-000000000002", campaign_id: "40000000-0000-0000-0000-000000000002" }])],
  ))
} catch {
  crossClientImportRejected = true
}
if (!crossClientImportRejected) throw new Error("Content CSV import accepted a client outside the account manager's access")

const workflowContentId = await asUser(employeeOne, async () => (await database.query(`
  select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Workflow alignment test', 'Instagram', 'Reel', null, 'for_review', '2026-10-11', '2026-10-19',
    '2026-10-21T15:00:00Z', 'pending', 'Confirm copy', 'Source note', 'Send for review', '${employeeOne}'
  ) as id
`)).rows[0]?.id)
if (typeof workflowContentId !== "string") throw new Error("Aligned content tracker create RPC failed")
await asUser(employeeOne, async () => database.query(`
  select public.update_content_tracker_item_for_current_user(
    '${workflowContentId}', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Workflow alignment test', 'Instagram', 'Reel', null, 'waiting_client', '2026-10-12', '2026-10-20',
    '2026-10-22T15:00:00Z', 'approved', 'Image delivered', 'Reviewed by AM', 'Await client reply',
    'Please revise the opening', '${employeeOne}'
  )
`))
const alignedContent = await database.query(`
  select status::text as status, work_date::text as work_date, deadline_at::text as deadline_at,
    client_approval_status, client_issues, notes, revision_count
  from public.content_items where id = '${workflowContentId}'
`)
if (alignedContent.rows[0]?.status !== "waiting_client" || alignedContent.rows[0]?.work_date !== "2026-10-12"
  || alignedContent.rows[0]?.deadline_at !== "2026-10-20" || alignedContent.rows[0]?.client_approval_status !== "approved"
  || alignedContent.rows[0]?.client_issues !== "Image delivered" || alignedContent.rows[0]?.notes !== "Reviewed by AM"
  || alignedContent.rows[0]?.revision_count !== 1) {
  throw new Error(`Aligned content tracker update failed: ${JSON.stringify(alignedContent.rows[0])}`)
}

const createdCampaignId = await asUser(employeeOne, async () => {
  const result = await database.query(`select public.create_campaign_for_current_user(
    '30000000-0000-0000-0000-000000000001', 'Schema campaign', 'Test campaign scope', 'draft', '2026-10-10', '2026-11-10'
  ) as id`)
  return result.rows[0]?.id
})
if (typeof createdCampaignId !== "string") throw new Error("Campaign creation RPC failed")

let duplicateCampaignUpdateRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_campaign_for_current_user(
    '${createdCampaignId}', 'autumn glow launch', null, 'draft', null, null
  )`))
} catch (error) {
  duplicateCampaignUpdateRejected = error?.code === "23505"
}
if (!duplicateCampaignUpdateRejected) throw new Error("Campaign update allowed a case-insensitive name collision")

let duplicateCampaignRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.create_campaign_for_current_user(
    '30000000-0000-0000-0000-000000000001', 'schema CAMPAIGN', null, 'draft', null, null
  )`))
} catch (error) {
  duplicateCampaignRejected = error?.code === "23505"
}
if (!duplicateCampaignRejected) throw new Error("Campaign create allowed a case-insensitive duplicate")

let crossClientCampaignRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.create_campaign_for_current_user(
    '30000000-0000-0000-0000-000000000002', 'Unauthorized client campaign', null, 'draft', null, null
  )`))
} catch (error) {
  crossClientCampaignRejected = error?.code === "42501"
}
if (!crossClientCampaignRejected) throw new Error("Campaign create accepted a client outside the user's access")

const createdClientId = await asUser(employeeOne, async () => {
  const result = await database.query(`select public.create_client_for_current_user(
    'Account Manager Client', 'account-manager-client', 'Created by the assigned account manager', null, array['Instagram', 'TikTok', 'instagram']
  ) as id`)
  return result.rows[0]?.id
})
if (typeof createdClientId !== "string") throw new Error("Account manager client creation RPC failed")
const createdClientPlatforms = await database.query(`select social_platforms from public.clients where id = '${createdClientId}'`)
if (JSON.stringify(createdClientPlatforms.rows[0]?.social_platforms) !== JSON.stringify(["Instagram", "TikTok"])) {
  throw new Error(`Client social platforms were not normalized and saved: ${JSON.stringify(createdClientPlatforms.rows[0]?.social_platforms)}`)
}
const createdClientOwner = await database.query(`
  select cm.user_id, cm.client_role::text as client_role, cm.is_primary
  from public.client_members cm where cm.client_id = '${createdClientId}' and cm.removed_at is null
`)
if (createdClientOwner.rows.length !== 1 || createdClientOwner.rows[0]?.user_id !== employeeOne
  || createdClientOwner.rows[0]?.client_role !== "account_manager" || createdClientOwner.rows[0]?.is_primary !== true) {
  throw new Error("New client was not assigned to its creating account manager as primary owner")
}
const accountManagerCreatedClients = await asUser(employeeOne, async () => (await database.query(
  `select count(*)::int as count from public.clients where id = '${createdClientId}'`,
)).rows[0]?.count)
const supervisorCreatedClients = await asUser(supervisor, async () => (await database.query(
  `select count(*)::int as count from public.clients where id = '${createdClientId}'`,
)).rows[0]?.count)
const supervisorCanSeeOwner = await asUser(supervisor, async () => (await database.query(
  `select count(*)::int as count from public.profiles where id = '${employeeOne}'`,
)).rows[0]?.count)
if (accountManagerCreatedClients !== 1 || supervisorCreatedClients !== 1 || supervisorCanSeeOwner !== 1) {
  throw new Error("The creating account manager or supervisor could not see the new client and its owner")
}
const unrelatedAccountManagerCreatedClients = await asUser(employeeTwo, async () => (await database.query(
  `select count(*)::int as count from public.clients where id = '${createdClientId}'`,
)).rows[0]?.count)
if (unrelatedAccountManagerCreatedClients !== 0) {
  throw new Error("An unrelated account manager could see a client outside their assignment")
}
let unrelatedManagerStatusRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.update_client_status_for_current_user('${createdClientId}', 'paused')`))
} catch (error) {
  unrelatedManagerStatusRejected = error?.code === "P0002"
}
if (!unrelatedManagerStatusRejected) throw new Error("An unrelated Account Manager could change a client's status")
await asUser(employeeOne, () => database.query(`select public.update_client_status_for_current_user('${createdClientId}', 'paused')`))
const pausedClient = await database.query(`select status::text as status from public.clients where id = '${createdClientId}'`)
if (pausedClient.rows[0]?.status !== "paused") throw new Error("Assigned Account Manager could not update their client status")
const retainedClientCampaignId = await asUser(employeeOne, async () => (await database.query(`
  select public.create_campaign_for_current_user('${createdClientId}', 'Retained history campaign', null, 'active', null, null) as id
`)).rows[0]?.id)
if (typeof retainedClientCampaignId !== "string") throw new Error("Could not prepare client history retention check")
let accountManagerAssignmentRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.set_client_account_managers(
    '${createdClientId}', array['${employeeOne}'::uuid, '${employeeTwo}'::uuid], '${employeeTwo}'
  )`))
} catch (error) {
  accountManagerAssignmentRejected = error?.code === "42501"
}
if (!accountManagerAssignmentRejected) throw new Error("An Account Manager could change client manager assignments")
await asUser(supervisor, () => database.query(`select public.set_client_account_managers(
  '${createdClientId}', array['${employeeOne}'::uuid, '${employeeTwo}'::uuid], '${employeeTwo}'
)`))
const supervisorManagedAccountManagers = await asUser(supervisor, async () => (await database.query(`
  select user_id, is_primary from public.client_members
  where client_id = '${createdClientId}' and client_role = 'account_manager' and removed_at is null
  order by user_id
`)).rows)
if (supervisorManagedAccountManagers.length !== 2
  || !supervisorManagedAccountManagers.some((member) => member.user_id === employeeTwo && member.is_primary)
  || !supervisorManagedAccountManagers.some((member) => member.user_id === employeeOne && !member.is_primary)) {
  throw new Error("Supervisor could not assign multiple Account Managers and set the primary owner")
}
const reassignedManagerCanSeeClient = await asUser(employeeTwo, async () => (await database.query(
  `select count(*)::int as count from public.clients where id = '${createdClientId}'`,
)).rows[0]?.count)
if (reassignedManagerCanSeeClient !== 1) throw new Error("Newly assigned Account Manager could not access the client")
let accountManagerTrashRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.move_client_to_trash('${createdClientId}')`))
} catch (error) {
  accountManagerTrashRejected = error?.code === "42501"
}
if (!accountManagerTrashRejected) throw new Error("An Account Manager could move a client to Trash")
await asUser(supervisor, () => database.query(`select public.move_client_to_trash('${createdClientId}')`))
const trashedClientForSupervisor = await asUser(supervisor, async () => (await database.query(`
  select status::text as status, deleted_at from public.clients where id = '${createdClientId}'
`)).rows[0])
const retainedTrashedCampaign = await database.query(`select count(*)::int as count from public.campaigns where id = '${retainedClientCampaignId}'`)
const trashedClientForManager = await asUser(employeeOne, async () => (await database.query(`
  select count(*)::int as count from public.clients where id = '${createdClientId}'
`)).rows[0]?.count)
if (trashedClientForSupervisor?.status !== "paused" || !trashedClientForSupervisor?.deleted_at
  || retainedTrashedCampaign.rows[0]?.count !== 1 || trashedClientForManager !== 0) {
  throw new Error("Client Trash did not hide the client for managers while preserving its linked campaign history")
}
await asUser(supervisor, () => database.query(`select public.restore_client_from_trash('${createdClientId}')`))
const restoredClient = await database.query(`select status::text as status, deleted_at from public.clients where id = '${createdClientId}'`)
if (restoredClient.rows[0]?.status !== "paused" || restoredClient.rows[0]?.deleted_at !== null) {
  throw new Error("Supervisor could not restore the client without changing its previous status")
}

let invalidCampaignDatesRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.create_campaign_for_current_user(
    '30000000-0000-0000-0000-000000000001', 'Invalid date range', null, 'draft', '2026-12-01', '2026-11-01'
  )`))
} catch (error) {
  invalidCampaignDatesRejected = error?.code === "22023"
}
if (!invalidCampaignDatesRejected) throw new Error("Campaign create accepted an end date before its start date")

await asUser(employeeOne, async () => database.query(`select public.update_campaign_for_current_user(
  '${createdCampaignId}', 'Schema campaign updated', 'Updated description', 'active', '2026-10-11', '2026-11-11'
)`))
const updatedCampaign = await asUser(employeeOne, async () => (await database.query(
  "select name, description, status::text as status, start_date::text as start_date from public.campaigns where id = $1",
  [createdCampaignId],
)).rows[0])
if (updatedCampaign?.name !== "Schema campaign updated" || updatedCampaign?.status !== "active" || updatedCampaign?.start_date !== "2026-10-11") {
  throw new Error("Campaign update failed to persist its validated fields")
}

let crossClientCampaignUpdateRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_campaign_for_current_user(
    '40000000-0000-0000-0000-000000000002', 'Cross-client edit', null, 'active', null, null
  )`))
} catch (error) {
  crossClientCampaignUpdateRejected = error?.code === "P0002"
}
if (!crossClientCampaignUpdateRejected) throw new Error("Campaign update exposed or modified a campaign outside the user's client access")

let unauthorizedArchiveRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.archive_campaign_for_current_user('${createdCampaignId}')`))
} catch (error) {
  unauthorizedArchiveRejected = error?.code === "42501"
}
if (!unauthorizedArchiveRejected) throw new Error("Account manager unexpectedly archived a campaign without campaigns.delete")

await database.exec(`update public.profiles set status = 'inactive', deactivated_at = now() where id = '${employeeOne}'`)
let inactiveCampaignMutationRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_campaign_for_current_user(
    '${createdCampaignId}', 'Inactive edit', null, 'active', null, null
  )`))
} catch (error) {
  inactiveCampaignMutationRejected = error?.code === "42501"
}
await database.exec(`update public.profiles set status = 'active', deactivated_at = null where id = '${employeeOne}'`)
if (!inactiveCampaignMutationRejected) throw new Error("Inactive user unexpectedly changed a campaign")

await asUser(administrator, async () => database.query(`select public.archive_campaign_for_current_user('${createdCampaignId}')`))
const archivedCampaignVisible = await asUser(employeeOne, async () => (await database.query(
  "select count(*)::int as count from public.campaigns where id = $1",
  [createdCampaignId],
)).rows[0]?.count)
if (archivedCampaignVisible !== 0) throw new Error("Archived campaign remained visible to a client reader")
const authenticatedCampaignGrant = await database.query(`
  select has_function_privilege('authenticated', 'public.create_campaign_for_current_user(uuid,text,text,public.campaign_status,date,date)', 'execute') as allowed
`)
if (authenticatedCampaignGrant.rows[0]?.allowed !== true) throw new Error("Authenticated role cannot invoke the permission-checked campaign RPC")

await asUser(employeeOne, async () => {
  await database.query(`select public.workflow_update_task_status('60000000-0000-0000-0000-000000000001', 'todo')`)
  await database.query(`select public.workflow_add_task_comment('60000000-0000-0000-0000-000000000001', 'Persistent test comment')`)
  await database.query(`select public.workflow_toggle_checklist('60000000-0000-0000-0000-000000000001', (select id from public.task_checklist_items where task_id = '60000000-0000-0000-0000-000000000001'))`)
  await database.query(`select public.workflow_create_task('Created through RPC', '30000000-0000-0000-0000-000000000001', 'Autumn Glow Launch', 'high', now() + interval '2 days')`)
})

let forbiddenMutationRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.workflow_update_task_status('60000000-0000-0000-0000-000000000002', 'in_progress')`))
} catch {
  forbiddenMutationRejected = true
}
if (!forbiddenMutationRejected) throw new Error("Employee unexpectedly changed another employee's task")
const postMutationCount = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)

await database.exec("set role service_role")
try {
  await database.query(`select public.admin_move_employee_to_trash('${administrator}', '${employeeOne}', 'one@example.test')`)
} finally {
  await database.exec("reset role")
}
const trashedEmployee = await database.query(`select status::text as status, deletion_requested_at, purge_after_at from public.profiles where id = '${employeeOne}'`)
if (trashedEmployee.rows[0]?.status !== "inactive" || !trashedEmployee.rows[0]?.deletion_requested_at || !trashedEmployee.rows[0]?.purge_after_at) {
  throw new Error("Employee account was not moved to trash with a purge date")
}
const trashedTaskVisibility = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)
if (trashedTaskVisibility !== 0) throw new Error("Trashed employee retained active task access")

await database.exec("set role service_role")
try {
  await database.query(`select public.admin_restore_employee_from_trash('${administrator}', '${employeeOne}')`)
} finally {
  await database.exec("reset role")
}
const restoredEmployee = await database.query(`select status::text as status, deletion_requested_at, auth_user_id from public.profiles where id = '${employeeOne}'`)
if (restoredEmployee.rows[0]?.status !== "active" || restoredEmployee.rows[0]?.deletion_requested_at !== null || restoredEmployee.rows[0]?.auth_user_id !== employeeOne) {
  throw new Error("Employee account was not restored correctly")
}

await database.exec("set role service_role")
try {
  await database.query(`select public.admin_update_employee('${administrator}', '${employeeOne}', 'Employee One', '', 'account_manager', 'inactive')`)
} finally {
  await database.exec("reset role")
}
const priorInactive = await database.query(`select deactivated_at from public.profiles where id = '${employeeOne}'`)
await database.exec("set role service_role")
try {
  await database.query(`select public.admin_move_employee_to_trash('${administrator}', '${employeeOne}', 'one@example.test')`)
  await database.query(`select public.admin_restore_employee_from_trash('${administrator}', '${employeeOne}')`)
} finally {
  await database.exec("reset role")
}
const restoredInactive = await database.query(`select status::text as status, deactivated_at from public.profiles where id = '${employeeOne}'`)
if (restoredInactive.rows[0]?.status !== "inactive" || Date.parse(restoredInactive.rows[0]?.deactivated_at) !== Date.parse(priorInactive.rows[0]?.deactivated_at)) {
  throw new Error(`Restoring a previously inactive employee changed their status: ${JSON.stringify({ before: priorInactive.rows[0], after: restoredInactive.rows[0] })}`)
}
await database.exec("set role service_role")
try {
  await database.query(`select public.admin_update_employee('${administrator}', '${employeeOne}', 'Employee One', '', 'account_manager', 'active')`)
} finally {
  await database.exec("reset role")
}

await database.exec("set role service_role")
try {
  await database.query(`select public.admin_move_employee_to_trash('${administrator}', '${employeeOne}', 'one@example.test')`)
} finally {
  await database.exec("reset role")
}
await database.exec(`update public.profiles set purge_after_at = now() - interval '1 second' where id = '${employeeOne}'`)
await database.exec(`delete from auth.users where id = '${employeeOne}'`)
await database.exec("set role service_role")
try {
  await database.query(`select public.finalize_expired_employee_deletion('${employeeOne}')`)
} finally {
  await database.exec("reset role")
}
const tombstone = await database.query(`select display_name, email::text as email, auth_user_id, purged_at from public.profiles where id = '${employeeOne}'`)
const retainedTaskAssignment = await database.query(`select count(*)::int as count from public.task_assignees where user_id = '${employeeOne}'`)
if (tombstone.rows[0]?.display_name !== "Deleted employee" || tombstone.rows[0]?.auth_user_id !== null || !tombstone.rows[0]?.purged_at || retainedTaskAssignment.rows[0]?.count !== 2) {
  throw new Error(`Expired account purge did not preserve history: ${JSON.stringify({ tombstone: tombstone.rows[0], retained: retainedTaskAssignment.rows[0] })}`)
}

const tableResult = await database.query(
  "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
)
const taskResult = await database.query("select count(*)::int as count from public.tasks")
const rlsResult = await database.query(`
  select count(*)::int as count
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and not relation.relrowsecurity
`)
const policyResult = await database.query("select count(*)::int as count from pg_policies where schemaname = 'public'")

const tableCount = tableResult.rows[0]?.count
const taskCount = taskResult.rows[0]?.count
const tablesWithoutRls = rlsResult.rows[0]?.count
const policyCount = policyResult.rows[0]?.count

if (tableCount !== 35) {
  throw new Error(`Expected 35 public tables, found ${tableCount}`)
}

if (taskCount !== 4) {
  throw new Error(`Seed should be idempotent before one RPC-created task; found ${taskCount} tasks`)
}

if (tablesWithoutRls !== 0) {
  throw new Error(`Unexpected RLS coverage: ${tablesWithoutRls} unchecked table(s)`)
}

if (policyCount !== 36 || postMutationCount !== 2) {
  throw new Error(`Unexpected policy or task mutation coverage: ${policyCount} policies, employee sees ${postMutationCount} tasks`)
}

console.log(`Schema validated: ${tableCount} tables, task/content workflow/import/campaign/content-review RLS and RPCs, immutable review versions and decisions, private Drive token/folder tables, client platforms, multi-manager ownership, client status and recoverable Trash, employee provisioning and Trash, first-admin bootstrap, profile updates, and ${policyCount} policies.`)
await database.close()

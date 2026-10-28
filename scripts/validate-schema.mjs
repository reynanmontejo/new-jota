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
const taskSubmissionReviewMigrationPath = "supabase/migrations/202610130001_task_submission_review_workflow.sql"
const taskRevisionResubmissionFixMigrationPath = "supabase/migrations/202610140001_task_revision_resubmission_fix.sql"
const taskWorkflowRealtimeMigrationPath = "supabase/migrations/202610150001_task_workflow_realtime_updates.sql"
const persistentTaskNotificationsMigrationPath = "supabase/migrations/202610160001_persistent_task_notifications.sql"
const taskCommentDueNotificationsMigrationPath = "supabase/migrations/202610170001_task_comment_and_due_notifications.sql"
const notificationWebPushMigrationPath = "supabase/migrations/202610180001_notification_web_push.sql"
const taskAssignmentTrashMigrationPath = "supabase/migrations/202610190001_task_assignment_and_trash.sql"
const defaultCampaignPauseGuardMigrationPath = "supabase/migrations/202610200001_default_campaign_and_pause_guard.sql"
const contentLinkedTasksMigrationPath = "supabase/migrations/202610210001_content_linked_tasks.sql"
const completedTaskTrashMigrationPath = "supabase/migrations/202610220001_completed_task_trash.sql"
const profileSecurityMigrationPath = "supabase/migrations/202610230001_profile_photos_and_password_approval.sql"
const taskArchiveMigrationPath = "supabase/migrations/202610250001_task_archive.sql"
const contentArchiveMigrationPath = "supabase/migrations/202610260001_content_archive_restore.sql"
const supervisorSelfAssignedTaskMigrationPath = "supabase/migrations/202610270001_allow_supervisor_self_assigned_tasks.sql"
const supervisorTaskReviewBypassMigrationPath = "supabase/migrations/202610280001_supervisor_own_tasks_bypass_review.sql"
const notificationPushDispatchMigrationPath = "supabase/migrations/202610290001_notification_push_dispatch.sql"
const notificationEmailDeliveryMigrationPath = "supabase/migrations/202610300001_email_notification_delivery.sql"
const optionalClientTasksMigrationPath = "supabase/migrations/202610300002_optional_client_tasks.sql"
const clientEditorExternalApprovalMigrationPath = "supabase/migrations/202610300003_client_editor_external_approval.sql"
const explicitClientHandoffMigrationPath = "supabase/migrations/202610300004_explicit_client_handoff.sql"
const contentReportingCategoriesMigrationPath = "supabase/migrations/202610310001_content_reporting_categories.sql"
const clientApprovalPublicationGuardMigrationPath = "supabase/migrations/202610310002_client_approval_publication_guard.sql"
const supervisorContentMigrationPath = "supabase/migrations/202611010001_supervisor_content_and_video_assignment.sql"
const videoTaskHandoffMigrationPath = "supabase/migrations/202611020001_video_content_task_handoff.sql"
const seedPath = "supabase/seed.sql"

function normalizeMigrationForPGlite(migration) {
  // PGlite validates PostgreSQL DDL locally but does not bundle Supabase's
  // hosted extensions/publications. Supabase applies the unchanged files.
  return migration
  .replace(/create extension if not exists pgcrypto;\s*/i, "")
  .replace(/create extension if not exists citext;\s*/i, "")
  .replace(/create extension if not exists pg_cron with schema pg_catalog;\s*/i, "")
  .replace(/create extension if not exists pg_net with schema net;\s*/i, "")
  .replace(/-- PGLITE_SKIP_START[\s\S]*?-- PGLITE_SKIP_END\s*/gi, "")
  .replace(/\bcitext\b/gi, "text")
}

async function createTestDatabase() {
  const instance = new PGlite()
  await instance.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create schema storage;
  grant usage on schema storage to authenticated;
  create table auth.users (id uuid primary key, email text);
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (bucket_id text not null, name text not null, primary key (bucket_id, name));
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  create function storage.foldername(p_name text) returns text[] language sql immutable as $$
    select string_to_array(p_name, '/')
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema cron;
  create table cron.job (jobid bigint generated always as identity primary key, jobname text not null);
  create function cron.unschedule(p_jobid bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid = p_jobid; return found; end $$;
  create function cron.schedule(p_jobname text, p_schedule text, p_command text) returns bigint language plpgsql as $$
  declare new_job_id bigint;
  begin insert into cron.job(jobname) values (p_jobname) returning jobid into new_job_id; return new_job_id; end $$;
  create schema net;
  create table net.test_http_calls (id bigint generated always as identity primary key, url text, headers jsonb);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds integer default 2000)
    returns bigint language plpgsql as $$
    declare request_id bigint;
    begin
      insert into net.test_http_calls (url, headers) values ($1, $4) returning id into request_id;
      return request_id;
    end $$;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text not null);
  insert into vault.decrypted_secrets (name, decrypted_secret) values
    ('jota_notification_dispatch_url', 'https://jota-test.vercel.app/api/notifications/dispatch'),
    ('jota_notification_dispatch_secret', 'test-notification-dispatch-secret-123456');
`)
  return instance
}

const migrationFiles = (await fs.readdir("supabase/migrations"))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort((left, right) => left.localeCompare(right))
const migrationVersions = migrationFiles.map((file) => file.slice(0, file.indexOf("_")))
if (new Set(migrationVersions).size !== migrationVersions.length) {
  throw new Error("Migration versions must be unique")
}

// A clean deployment must apply every committed migration in the exact order
// used by the Supabase CLI. Keep this database separate from the populated
// behavior fixture below, which deliberately exercises additive backfills.
const orderedDatabase = await createTestDatabase()
try {
  for (const file of migrationFiles) {
    const sql = normalizeMigrationForPGlite(await fs.readFile(`supabase/migrations/${file}`, "utf8"))
    await orderedDatabase.exec(sql)
  }
} finally {
  await orderedDatabase.close()
}

const database = await createTestDatabase()
let migration = normalizeMigrationForPGlite(await fs.readFile(migrationPath, "utf8"))
await database.exec(migration)
await database.exec(normalizeMigrationForPGlite(await fs.readFile(authMigrationPath, "utf8")))
await database.exec(normalizeMigrationForPGlite(await fs.readFile(profileMigrationPath, "utf8")))

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
await database.exec(await fs.readFile(taskSubmissionReviewMigrationPath, "utf8"))
await database.exec(await fs.readFile(taskRevisionResubmissionFixMigrationPath, "utf8"))
let taskWorkflowRealtimeMigration = await fs.readFile(taskWorkflowRealtimeMigrationPath, "utf8")
// PGlite does not model PostgreSQL publications; Supabase applies this hosted-only block.
taskWorkflowRealtimeMigration = taskWorkflowRealtimeMigration.replace(/-- PGLITE_SKIP_START[\s\S]*?-- PGLITE_SKIP_END\s*/i, "")
await database.exec(taskWorkflowRealtimeMigration)
let persistentTaskNotificationsMigration = await fs.readFile(persistentTaskNotificationsMigrationPath, "utf8")
persistentTaskNotificationsMigration = persistentTaskNotificationsMigration.replace(/-- PGLITE_SKIP_START[\s\S]*?-- PGLITE_SKIP_END\s*/i, "")
await database.exec(persistentTaskNotificationsMigration)
await database.exec(await fs.readFile(taskCommentDueNotificationsMigrationPath, "utf8"))
await database.exec(await fs.readFile(notificationWebPushMigrationPath, "utf8"))
await database.exec(await fs.readFile(taskAssignmentTrashMigrationPath, "utf8"))
await database.exec(await fs.readFile(defaultCampaignPauseGuardMigrationPath, "utf8"))
await database.exec(await fs.readFile(contentLinkedTasksMigrationPath, "utf8"))
await database.exec(await fs.readFile(completedTaskTrashMigrationPath, "utf8"))
await database.exec(await fs.readFile(profileSecurityMigrationPath, "utf8"))
await database.exec(await fs.readFile(taskArchiveMigrationPath, "utf8"))
await database.exec(await fs.readFile(contentArchiveMigrationPath, "utf8"))
await database.exec(await fs.readFile(supervisorSelfAssignedTaskMigrationPath, "utf8"))
await database.exec(await fs.readFile(supervisorTaskReviewBypassMigrationPath, "utf8"))
let notificationPushDispatchMigration = await fs.readFile(notificationPushDispatchMigrationPath, "utf8")
notificationPushDispatchMigration = notificationPushDispatchMigration.replace(/create extension if not exists pg_net with schema net;\s*/i, "")
await database.exec(notificationPushDispatchMigration)
await database.exec(await fs.readFile(notificationEmailDeliveryMigrationPath, "utf8"))
await database.exec(await fs.readFile(optionalClientTasksMigrationPath, "utf8"))
let clientEditorExternalApprovalMigration = await fs.readFile(clientEditorExternalApprovalMigrationPath, "utf8")
clientEditorExternalApprovalMigration = clientEditorExternalApprovalMigration.replace(/-- PGLITE_SKIP_START[\s\S]*?-- PGLITE_SKIP_END\s*/i, "")
await database.exec(clientEditorExternalApprovalMigration)
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

const emailNotificationId = "92000000-0000-0000-0000-000000000001"
await asUser(employeeOne, () => database.query(`select public.set_notification_email_preference_for_current_user(true)`))
await database.query(`insert into public.notifications (
  id, organization_id, recipient_id, type, title, body, entity_type, entity_id, href
) values (
  '${emailNotificationId}', '10000000-0000-0000-0000-000000000001', '${employeeOne}', 'task_assigned',
  'Email queue test', 'A sample notification', 'task', '60000000-0000-0000-0000-000000000001', '/tasks/60000000-0000-0000-0000-000000000001'
)`)
await database.exec("set role service_role")
try {
  const emailBatch = await database.query(`select * from public.claim_notification_email_batch(10)`)
  if (emailBatch.rows.length !== 1 || emailBatch.rows[0]?.notification_id !== emailNotificationId
    || emailBatch.rows[0]?.recipient_email !== "one@example.test") {
    throw new Error(`Opted-in notification was not safely queued with the recipient address: ${JSON.stringify(emailBatch.rows)}`)
  }
  await database.query(`select public.finish_notification_email_attempt('${emailBatch.rows[0].queue_id}', true, null)`)
} finally {
  await database.exec("reset role")
}
const emailQueueResult = await database.query(`
  select queue.processed_at, preference.email_enabled
  from public.notification_email_queue queue
  join public.notification_preferences preference
    on preference.organization_id = queue.organization_id and preference.user_id = queue.recipient_id
  where queue.notification_id = '${emailNotificationId}'
`)
if (!emailQueueResult.rows[0]?.processed_at || emailQueueResult.rows[0]?.email_enabled !== true) {
  throw new Error("Email notification queue completion or recipient preference was not persisted")
}
await asUser(employeeOne, () => database.query(`select public.set_notification_email_preference_for_current_user(false)`))
const emailRpcGrants = await database.query(`
  select has_function_privilege('authenticated', 'public.set_notification_email_preference_for_current_user(boolean)', 'execute') as user_can_set,
         has_function_privilege('authenticated', 'public.claim_notification_email_batch(integer)', 'execute') as user_can_claim,
         has_function_privilege('service_role', 'public.claim_notification_email_batch(integer)', 'execute') as worker_can_claim,
         has_table_privilege('authenticated', 'public.notification_email_queue', 'select') as user_can_read_queue
`)
if (emailRpcGrants.rows[0]?.user_can_set !== true || emailRpcGrants.rows[0]?.user_can_claim !== false
  || emailRpcGrants.rows[0]?.worker_can_claim !== true || emailRpcGrants.rows[0]?.user_can_read_queue !== false) {
  throw new Error(`Email notification grants are not least-privilege: ${JSON.stringify(emailRpcGrants.rows[0])}`)
}

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

const passwordRequestId = "91000000-0000-0000-0000-000000000001"
await database.exec("set role service_role")
try {
  await database.query(`insert into public.password_change_requests (id, organization_id, user_id, request_note)
    values ('${passwordRequestId}', '10000000-0000-0000-0000-000000000001', '${employeeOne}', 'Lost access to current password')`)
} finally { await database.exec("reset role") }
let duplicatePasswordRequestRejected = false
await database.exec("set role service_role")
try {
  await database.query(`insert into public.password_change_requests (organization_id, user_id)
    values ('10000000-0000-0000-0000-000000000001', '${employeeOne}')`)
} catch (error) {
  duplicatePasswordRequestRejected = error?.code === "23505"
} finally { await database.exec("reset role") }
if (!duplicatePasswordRequestRejected) throw new Error("A user was allowed more than one pending/approved password request")
let employeePasswordRequestReadRejected = false
try {
  await asUser(employeeOne, () => database.query(`select * from public.password_change_requests where id = '${passwordRequestId}'`))
} catch (error) {
  employeePasswordRequestReadRejected = error?.code === "42501"
}
if (!employeePasswordRequestReadRejected) throw new Error("Authenticated users can read password request records directly")
const requestPermissions = await database.query(`
  select has_table_privilege('authenticated', 'public.password_change_requests', 'select') as employee_can_read,
         has_table_privilege('service_role', 'public.password_change_requests', 'select') as service_can_read,
         (select count(*)::int from information_schema.columns where table_schema = 'public'
           and table_name = 'password_change_requests' and column_name ilike '%password%') as password_columns,
         (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'profile_avatars_%') as avatar_policies
`)
if (requestPermissions.rows[0]?.employee_can_read !== false
  || requestPermissions.rows[0]?.service_can_read !== true
  || requestPermissions.rows[0]?.password_columns !== 0
  || requestPermissions.rows[0]?.avatar_policies !== 3) {
  throw new Error(`Profile photo/password request security configuration failed: ${JSON.stringify(requestPermissions.rows[0])}`)
}
await asUser(employeeOne, () => database.query(`insert into storage.objects (bucket_id, name) values ('profile-avatars', '${employeeOne}/avatar.webp')`))
let crossUserAvatarUploadRejected = false
try {
  await asUser(employeeTwo, () => database.query(`insert into storage.objects (bucket_id, name) values ('profile-avatars', '${employeeOne}/intruder.webp')`))
} catch (error) {
  crossUserAvatarUploadRejected = error?.code === "42501"
}
if (!crossUserAvatarUploadRejected) throw new Error("Users can upload an avatar into another user's storage folder")
await database.exec("set role service_role")
try {
  await database.query(`update public.password_change_requests set status = 'approved', decided_by = '${administrator}', decided_at = now()
    where id = '${passwordRequestId}'`)
  await database.query(`update public.password_change_requests set status = 'completed', completed_at = now()
    where id = '${passwordRequestId}'`)
} finally { await database.exec("reset role") }

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
const archivedContentVisibleToOwner = await asUser(employeeOne, async () => (await database.query(`
  select count(*)::int as count from public.content_items
  where id = '${trackedContentId}' and deleted_at is not null
`)).rows[0]?.count)
const archivedContentVisibleToOtherClient = await asUser(employeeTwo, async () => (await database.query(`
  select count(*)::int as count from public.content_items
  where id = '${trackedContentId}' and deleted_at is not null
`)).rows[0]?.count)
if (archivedContentVisibleToOwner !== 1 || archivedContentVisibleToOtherClient !== 0) {
  throw new Error(`Archived content access was not properly scoped: owner=${archivedContentVisibleToOwner}, other client=${archivedContentVisibleToOtherClient}`)
}
let crossClientRestoreRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.restore_content_item_for_current_user('${trackedContentId}')`))
} catch (error) {
  crossClientRestoreRejected = error?.code === "P0002"
}
if (!crossClientRestoreRejected) throw new Error("A user without client access restored another client's content")
await asUser(employeeOne, () => database.query(`select public.restore_content_item_for_current_user('${trackedContentId}')`))
const restoredContent = await database.query(`select deleted_at from public.content_items where id = '${trackedContentId}'`)
if (restoredContent.rows[0]?.deleted_at !== null) throw new Error("Content restore RPC did not restore the archived item")
const restoreActivity = await database.query(`
  select count(*)::int as count from public.activity_logs
  where entity_type = 'content_item' and entity_id = '${trackedContentId}' and action = 'CONTENT_RESTORED'
`)
if (restoreActivity.rows[0]?.count !== 1) throw new Error("Content restore did not create an activity log entry")
const contentRestoreGrants = await database.query(`
  select has_function_privilege('authenticated', 'public.restore_content_item_for_current_user(uuid)', 'execute') as authenticated_allowed,
         has_function_privilege('anon', 'public.restore_content_item_for_current_user(uuid)', 'execute') as anon_allowed
`)
if (contentRestoreGrants.rows[0]?.authenticated_allowed !== true || contentRestoreGrants.rows[0]?.anon_allowed !== false) {
  throw new Error("Content restore RPC grants are not restricted to authenticated users")
}
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
    '2026-10-22T15:00:00Z', 'pending', 'Confirm copy', 'Reviewed by AM', 'Await client reply',
    'Please revise the opening', '${employeeOne}'
  )
`))
const alignedContent = await database.query(`
  select status::text as status, work_date::text as work_date, deadline_at::text as deadline_at,
    client_approval_status, client_issues, notes, revision_count
  from public.content_items where id = '${workflowContentId}'
`)
if (alignedContent.rows[0]?.status !== "waiting_client" || alignedContent.rows[0]?.work_date !== "2026-10-12"
  || alignedContent.rows[0]?.deadline_at !== "2026-10-20" || alignedContent.rows[0]?.client_approval_status !== "pending"
  || alignedContent.rows[0]?.client_issues !== "Confirm copy" || alignedContent.rows[0]?.notes !== "Reviewed by AM"
  || alignedContent.rows[0]?.revision_count !== 1) {
  throw new Error(`Aligned content tracker update failed: ${JSON.stringify(alignedContent.rows[0])}`)
}
await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('${workflowContentId}', 'approved', null)`))
const externallyApprovedContent = await database.query(`select status::text as status, client_approval_status, client_issues from public.content_items where id = '${workflowContentId}'`)
if (externallyApprovedContent.rows[0]?.status !== "waiting_client"
  || externallyApprovedContent.rows[0]?.client_approval_status !== "approved"
  || externallyApprovedContent.rows[0]?.client_issues !== null) {
  throw new Error(`External client approval incorrectly changed content production status: ${JSON.stringify(externallyApprovedContent.rows[0])}`)
}
let directClientDecisionWriteRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_content_tracker_item_for_current_user(
    '${workflowContentId}', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Workflow alignment test', 'Instagram', 'Reel', null, 'waiting_client', '2026-10-12', '2026-10-20',
    '2026-10-22T15:00:00Z', 'rejected', null, 'Reviewed by AM', 'Await client reply',
    'Please revise the opening', '${employeeOne}'
  )`))
} catch (error) { directClientDecisionWriteRejected = error?.code === "42501" }
if (!directClientDecisionWriteRejected) throw new Error("Generic content edit RPC unexpectedly changed the external client decision")

const defaultCampaignId = await asUser(employeeOne, async () => (await database.query(`
  select public.ensure_default_campaign_for_current_user('30000000-0000-0000-0000-000000000001') as id
`)).rows[0]?.id)
const repeatedDefaultCampaignId = await asUser(employeeOne, async () => (await database.query(`
  select public.ensure_default_campaign_for_current_user('30000000-0000-0000-0000-000000000001') as id
`)).rows[0]?.id)
const defaultCampaign = await database.query("select name, status::text as status from public.campaigns where id = $1", [defaultCampaignId])
if (typeof defaultCampaignId !== "string" || repeatedDefaultCampaignId !== defaultCampaignId
  || defaultCampaign.rows[0]?.name !== "General / Ongoing"
  || !["draft", "active"].includes(defaultCampaign.rows[0]?.status)) {
  throw new Error("Per-client General / Ongoing campaign creation or reuse failed")
}

const createdCampaignId = await asUser(employeeOne, async () => {
  const result = await database.query(`select public.create_campaign_for_current_user(
    '30000000-0000-0000-0000-000000000001', 'Schema campaign', 'Test campaign scope', 'draft', '2026-10-10', '2026-11-10'
  ) as id`)
  return result.rows[0]?.id
})
if (typeof createdCampaignId !== "string") throw new Error("Campaign creation RPC failed")

const contentInDraftCampaignId = await asUser(employeeOne, async () => (await database.query(`
  select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '${createdCampaignId}',
    'Campaign status guard test', 'Instagram', 'Graphic', null, 'planned', null, null,
    null, null, null, null, null, '${employeeOne}'
  ) as id
`)).rows[0]?.id)
if (typeof contentInDraftCampaignId !== "string") throw new Error("Draft campaign should accept new content")
await asUser(employeeOne, async () => database.query(`select public.update_campaign_for_current_user(
  '${createdCampaignId}', 'Schema campaign', 'Test campaign scope', 'paused', '2026-10-10', '2026-11-10'
)`))
let pausedCampaignContentRejected = false
try {
  await asUser(employeeOne, () => database.query(`
    select public.create_content_tracker_item_for_current_user(
      '30000000-0000-0000-0000-000000000001', '${createdCampaignId}',
      'Should not enter paused campaign', 'Instagram', 'Graphic', null, 'planned', null, null,
      null, null, null, null, null, '${employeeOne}'
    )
  `))
} catch (error) {
  pausedCampaignContentRejected = error?.code === "23514"
}
if (!pausedCampaignContentRejected) throw new Error("Paused campaign accepted new content")
await asUser(employeeOne, async () => database.query(`select public.update_content_tracker_item_for_current_user(
  '${contentInDraftCampaignId}', '30000000-0000-0000-0000-000000000001', '${createdCampaignId}',
  'Campaign status guard test', 'Instagram', 'Graphic', null, 'in_production', null, null,
  null, null, null, null, null, null, '${employeeOne}'
)`))
await asUser(employeeOne, async () => database.query(`select public.update_campaign_for_current_user(
  '${createdCampaignId}', 'Schema campaign', 'Test campaign scope', 'draft', '2026-10-10', '2026-11-10'
)`))

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
let unrelatedManagerEditorListRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select * from public.workflow_list_client_video_editor_candidates('${createdClientId}')`))
} catch (error) { unrelatedManagerEditorListRejected = error?.code === "P0002" }
if (!unrelatedManagerEditorListRejected) throw new Error("An Account Manager without client access could view the Video Editor candidate list")
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
const editorCandidates = await asUser(employeeOne, async () => (await database.query(`
  select user_id, display_name from public.workflow_list_client_video_editor_candidates('${createdClientId}') order by user_id
`)).rows)
if (editorCandidates.length !== 2
  || !editorCandidates.some((candidate) => candidate.user_id === employeeOne && candidate.display_name === "Employee One")
  || !editorCandidates.some((candidate) => candidate.user_id === employeeTwo && candidate.display_name === "Employee Two")) {
  throw new Error(`Account Manager could not load the restricted Video Editor list: ${JSON.stringify(editorCandidates)}`)
}
await database.exec(`insert into public.client_members (organization_id, client_id, user_id, client_role, assigned_by)
  values ('10000000-0000-0000-0000-000000000001', '${createdClientId}', '${employeeOne}', 'video_editor', '${supervisor}'),
         ('10000000-0000-0000-0000-000000000001', '${createdClientId}', '${employeeTwo}', 'video_editor', '${supervisor}')`)
await asUser(employeeOne, () => database.query(`select public.set_client_video_editor('${createdClientId}', '${employeeTwo}')`))
await asUser(employeeOne, () => database.query(`select public.set_client_video_editor('${createdClientId}', '${employeeOne}')`))
const assignedVideoEditors = await database.query(`select user_id from public.client_members
  where client_id = '${createdClientId}' and client_role = 'video_editor' and removed_at is null`)
if (assignedVideoEditors.rows.length !== 1 || assignedVideoEditors.rows[0]?.user_id !== employeeOne) {
  throw new Error("Account Manager could not replace the client Video Editor while keeping exactly one active assignment")
}
const duplicateAssignmentAudit = await database.query(`select metadata->'from_user_ids' as from_user_ids
  from public.activity_logs where entity_type = 'client' and entity_id = '${createdClientId}'
    and action = 'CLIENT_VIDEO_EDITOR_CHANGED' order by created_at limit 1`)
if (duplicateAssignmentAudit.rows[0]?.from_user_ids?.length !== 2) {
  throw new Error("Replacing duplicate editor assignments did not preserve both prior assignees in the audit log")
}
let supervisorAsVideoEditorRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.set_client_video_editor('${createdClientId}', '${supervisor}')`))
} catch (error) { supervisorAsVideoEditorRejected = error?.code === "22023" }
if (!supervisorAsVideoEditorRejected) throw new Error("A Supervisor was unexpectedly eligible for the client Video Editor role")
await asUser(supervisor, () => database.query(`select public.set_client_video_editor('${createdClientId}', '${employeeTwo}')`))
const reassignedVideoEditor = await database.query(`select user_id from public.client_members
  where client_id = '${createdClientId}' and client_role = 'video_editor' and removed_at is null`)
if (reassignedVideoEditor.rows.length !== 1 || reassignedVideoEditor.rows[0]?.user_id !== employeeTwo) {
  throw new Error("Supervisor could not replace the client Video Editor")
}
await asUser(supervisor, () => database.query(`select public.set_client_video_editor('${createdClientId}', null)`))
const clearedVideoEditor = await database.query(`select count(*)::int as count from public.client_members
  where client_id = '${createdClientId}' and client_role = 'video_editor' and removed_at is null`)
if (clearedVideoEditor.rows[0]?.count !== 0) throw new Error("Supervisor could not clear a client Video Editor assignment")
let unrelatedManagerVideoEditorRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.set_client_video_editor('30000000-0000-0000-0000-000000000002', '${employeeOne}')`))
} catch (error) { unrelatedManagerVideoEditorRejected = error?.code === "42501" }
if (!unrelatedManagerVideoEditorRejected) throw new Error("Account Manager changed Video Editor assignment for an inaccessible client")
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
  await database.query(`select public.workflow_create_task('Created through RPC', '30000000-0000-0000-0000-000000000001', 'Autumn Glow Launch', 'high', now() + interval '2 days', '${employeeOne}')`)
})

let employeeCannotAssignTaskRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.workflow_create_task(
    'Unauthorized assignment', '30000000-0000-0000-0000-000000000001', null, 'medium', now() + interval '3 days', '${employeeTwo}'
  )`))
} catch (error) {
  employeeCannotAssignTaskRejected = error?.code === "42501"
}
if (!employeeCannotAssignTaskRejected) throw new Error("Account Manager unexpectedly assigned a task to another person")

const linkedContentTaskId = await asUser(employeeOne, async () => (await database.query(`select public.workflow_create_task_for_content(
  '50000000-0000-0000-0000-000000000001', 'Create graphics for launch carousel', 'high', now() + interval '2 days', '${employeeOne}'
) as id`)).rows[0]?.id)
const linkedContentTask = await database.query(`
  select t.client_id, t.campaign_id, t.content_item_id, t.title, ta.user_id
  from public.tasks t join public.task_assignees ta on ta.task_id = t.id and ta.is_primary
  where t.id = '${linkedContentTaskId}'
`)
if (!linkedContentTaskId
  || linkedContentTask.rows[0]?.client_id !== "30000000-0000-0000-0000-000000000001"
  || linkedContentTask.rows[0]?.campaign_id !== "40000000-0000-0000-0000-000000000001"
  || linkedContentTask.rows[0]?.content_item_id !== "50000000-0000-0000-0000-000000000001"
  || linkedContentTask.rows[0]?.user_id !== employeeOne) {
  throw new Error("Content-linked task did not preserve the content client, campaign, and assignment")
}
let crossClientContentTaskRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.workflow_create_task_for_content(
    '50000000-0000-0000-0000-000000000002', 'Unauthorized linked task', 'medium', now() + interval '2 days', '${employeeOne}'
  )`))
} catch (error) {
  crossClientContentTaskRejected = error?.code === "P0002"
}
if (!crossClientContentTaskRejected) throw new Error("Account Manager created a task linked to content outside their client access")
const linkedTaskRpcGrant = await database.query(`select has_function_privilege(
  'authenticated', 'public.workflow_create_task_for_content(uuid,text,public.task_priority,timestamptz,uuid)', 'execute'
) as allowed`)
if (linkedTaskRpcGrant.rows[0]?.allowed !== true) throw new Error("Authenticated role cannot call the permission-checked content-linked task RPC")

const supervisorTaskId = await asUser(supervisor, async () => (await database.query(`select public.workflow_create_task(
  'Supervisor off-calendar request', '30000000-0000-0000-0000-000000000002', null, 'medium', now() + interval '4 days', '${employeeTwo}'
) as id`)).rows[0]?.id)
const supervisorTaskAssignment = await database.query(`
  select t.created_by, t.campaign_id, ta.user_id, ta.assigned_by
  from public.tasks t join public.task_assignees ta on ta.task_id = t.id and ta.is_primary
  where t.id = '${supervisorTaskId}'
`)
if (!supervisorTaskId
  || supervisorTaskAssignment.rows[0]?.created_by !== supervisor
  || supervisorTaskAssignment.rows[0]?.campaign_id !== null
  || supervisorTaskAssignment.rows[0]?.user_id !== employeeTwo
  || supervisorTaskAssignment.rows[0]?.assigned_by !== supervisor) {
  throw new Error("Supervisor task assignment or campaign-optional behavior failed")
}
const assignmentNotificationCount = await asUser(employeeTwo, async () => (await database.query(`
  select count(*)::int as count from public.notifications
  where recipient_id = '${employeeTwo}' and type = 'task_assigned' and entity_id = '${supervisorTaskId}'
`)).rows[0]?.count)
if (assignmentNotificationCount !== 1) throw new Error("Assigned Account Manager did not receive a task assignment notification")

const supervisorOwnTaskId = await asUser(supervisor, async () => (await database.query(`select public.workflow_create_task(
  'Supervisor self-owned task', '30000000-0000-0000-0000-000000000002', null, 'medium', now() + interval '4 days', '${supervisor}'
) as id`)).rows[0]?.id)
const supervisorOwnTaskFileId = "90000000-0000-0000-0000-000000000006"
await database.query(`insert into public.attachments (
  id, organization_id, client_id, task_id, provider_file_id, file_name,
  mime_type, size_bytes, uploaded_by
) values (
  '${supervisorOwnTaskFileId}', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', '${supervisorOwnTaskId}',
  'drive-supervisor-own-task', 'supervisor-work.png', 'image/png', 800, '${supervisor}'
)`)
let supervisorOwnTaskReviewRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.submit_task_for_review(
    '${supervisorOwnTaskId}', array['${supervisorOwnTaskFileId}'::uuid], 'Ready for review'
  )`))
} catch (error) {
  supervisorOwnTaskReviewRejected = error?.code === "42501"
}
if (!supervisorOwnTaskReviewRejected) throw new Error("Supervisor was allowed to submit their own task for approval")
await asUser(supervisor, () => database.query(`select public.workflow_update_task_status('${supervisorOwnTaskId}', 'completed')`))
const completedOwnTask = await database.query(`select status::text as status, completed_at from public.tasks where id = '${supervisorOwnTaskId}'`)
if (completedOwnTask.rows[0]?.status !== "completed" || !completedOwnTask.rows[0]?.completed_at) {
  throw new Error("Supervisor could not complete their own task without approval")
}
let supervisorCannotSkipReviewForEmployeeRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.workflow_update_task_status('${supervisorTaskId}', 'completed')`))
} catch (error) {
  supervisorCannotSkipReviewForEmployeeRejected = error?.code === "42501"
}
if (!supervisorCannotSkipReviewForEmployeeRejected) throw new Error("Supervisor bypassed review for an employee-owned task")

await asUser(employeeTwo, async () => database.query(`select public.workflow_trash_task_for_current_user('${supervisorTaskId}')`))
const visibleTaskTrash = await asUser(employeeTwo, async () => (await database.query(
  `select task_id, title from public.workflow_list_task_trash() where task_id = '${supervisorTaskId}'`,
)).rows[0])
if (visibleTaskTrash?.title !== "Supervisor off-calendar request") throw new Error("Task owner could not find their trashed task")
const anotherEmployeeTrashCount = await asUser(employeeOne, async () => (await database.query(
  `select count(*)::int as count from public.workflow_list_task_trash() where task_id = '${supervisorTaskId}'`,
)).rows[0]?.count)
if (anotherEmployeeTrashCount !== 0) throw new Error("Task Trash exposed another employee's trashed assignment")
let anotherEmployeeRestoreRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.workflow_restore_task_from_trash('${supervisorTaskId}')`))
} catch (error) {
  anotherEmployeeRestoreRejected = error?.code === "42501"
}
if (!anotherEmployeeRestoreRejected) throw new Error("Another employee unexpectedly restored a task they could not access")
await asUser(employeeTwo, async () => database.query(`select public.workflow_restore_task_from_trash('${supervisorTaskId}')`))
const restoredSupervisorTask = await database.query(`select deleted_at from public.tasks where id = '${supervisorTaskId}'`)
if (restoredSupervisorTask.rows[0]?.deleted_at !== null) throw new Error("Task restore failed")

const cancellationAttachmentId = "90000000-0000-0000-0000-000000000005"
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, task_id, provider_file_id, file_name,
  mime_type, size_bytes, uploaded_by
) values (
  '${cancellationAttachmentId}', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', '${supervisorTaskId}',
  'drive-cancelled-task', 'reference.png', 'image/png', 800, '${employeeTwo}'
)`)
await asUser(supervisor, async () => database.query(`select public.workflow_cancel_task_for_current_user('${supervisorTaskId}', 'No longer needed')`))
const cancelledTaskPreservesFile = await database.query(`
  select t.status::text as status, a.id as attachment_id
  from public.tasks t left join public.attachments a on a.task_id = t.id
  where t.id = '${supervisorTaskId}'
`)
if (cancelledTaskPreservesFile.rows[0]?.status !== 'cancelled'
  || cancelledTaskPreservesFile.rows[0]?.attachment_id !== cancellationAttachmentId) {
  throw new Error("Task cancellation failed or removed the task's existing file")
}

const oldTaskRpcAllowed = await database.query(`select has_function_privilege(
  'authenticated', 'public.workflow_create_task(text,uuid,text,public.task_priority,timestamptz)', 'execute'
) as allowed`)
if (oldTaskRpcAllowed.rows[0]?.allowed !== false) throw new Error("Obsolete task creation RPC remains executable")

let forbiddenMutationRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.workflow_update_task_status('60000000-0000-0000-0000-000000000002', 'in_progress')`))
} catch {
  forbiddenMutationRejected = true
}
if (!forbiddenMutationRejected) throw new Error("Employee unexpectedly changed another employee's task")
const postMutationCount = await asUser(employeeOne, async () => (await database.query("select count(*)::int as count from public.tasks")).rows[0]?.count)

const taskFileOne = "90000000-0000-0000-0000-000000000003"
const taskFileTwo = "90000000-0000-0000-0000-000000000004"
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, task_id, provider_file_id,
  file_name, mime_type, size_bytes, uploaded_by
) values (
  '${taskFileOne}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'drive-task-one', 'task-v1.png', 'image/png', 1200, '${employeeOne}'
)`)
const taskVersionOne = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_task_for_review(
    '60000000-0000-0000-0000-000000000001', array['${taskFileOne}'::uuid], 'Please review the first draft'
  ) as version_id
`)).rows[0]?.version_id)
let reviewedTaskTrashRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.workflow_trash_task_for_current_user('60000000-0000-0000-0000-000000000001')`))
} catch (error) {
  reviewedTaskTrashRejected = error?.code === "22023"
}
if (!reviewedTaskTrashRejected) throw new Error("Task with submitted work was moved to Trash instead of preserving its review history")
const taskQueueCount = await asUser(supervisor, async () => (await database.query(`
  select count(*)::int as count from public.submissions where status = 'submitted'
`)).rows[0]?.count)
const taskAfterSubmit = await database.query(`select status::text as status from public.tasks where id = '60000000-0000-0000-0000-000000000001'`)
if (!taskVersionOne || taskQueueCount !== 1 || taskAfterSubmit.rows[0]?.status !== 'for_review') {
  throw new Error("Task submission did not create a persistent reviewable version")
}
const reviewNotificationCount = await asUser(supervisor, async () => (await database.query(`
  select count(*)::int as count from public.notifications
  where recipient_id = '${supervisor}' and type = 'submitted_for_review'
    and entity_id = '60000000-0000-0000-0000-000000000001'
`)).rows[0]?.count)
if (reviewNotificationCount !== 1) throw new Error("Task submission did not notify the authorized supervisor")

await database.exec(`insert into public.role_permissions (organization_id, role_id, permission_code)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'tasks.review') on conflict do nothing`)
let taskSelfReviewRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.review_task_submission('${taskVersionOne}', 'approved', null)`))
} catch (error) {
  taskSelfReviewRejected = error?.code === "42501"
} finally {
  await database.exec(`delete from public.role_permissions where organization_id = '10000000-0000-0000-0000-000000000001' and role_id = '20000000-0000-0000-0000-000000000001' and permission_code = 'tasks.review'`)
}
if (!taskSelfReviewRejected) throw new Error("Task submitter was allowed to review their own task version")

let emptyTaskFeedbackRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.review_task_submission('${taskVersionOne}', 'revision_requested', null)`))
} catch (error) {
  emptyTaskFeedbackRejected = error?.code === "22023"
}
if (!emptyTaskFeedbackRejected) throw new Error("Task revision was allowed without supervisor feedback")
await asUser(supervisor, () => database.query(`select public.review_task_submission('${taskVersionOne}', 'revision_requested', 'Please adjust the layout')`))
const taskAfterRevision = await database.query(`select status::text as status from public.tasks where id = '60000000-0000-0000-0000-000000000001'`)
if (taskAfterRevision.rows[0]?.status !== 'revision_requested') throw new Error("Task revision decision did not return the task to the owner")
const revisionNotificationCount = await asUser(employeeOne, async () => (await database.query(`
  select count(*)::int as count from public.notifications
  where recipient_id = '${employeeOne}' and type = 'revision_requested'
    and entity_id = '60000000-0000-0000-0000-000000000001'
`)).rows[0]?.count)
if (revisionNotificationCount !== 1) throw new Error("Revision feedback did not notify the task submitter")

await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, task_id, provider_file_id,
  file_name, mime_type, size_bytes, uploaded_by, created_at
) values (
  '${taskFileTwo}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'drive-task-two', 'task-v2.png', 'image/png', 1400, '${employeeOne}',
  (select max(v.submitted_at) from public.submission_versions v
   join public.submissions s on s.id = v.submission_id
   where s.task_id = '60000000-0000-0000-0000-000000000001')
)`)
let oldTaskFileResubmissionRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.submit_task_for_review(
    '60000000-0000-0000-0000-000000000001', array['${taskFileOne}'::uuid], 'Submitting the old file again'
  )`))
} catch (error) {
  oldTaskFileResubmissionRejected = error?.code === "22023"
}
if (!oldTaskFileResubmissionRejected) throw new Error("Task resubmission was allowed without a new upload")
const taskVersionTwo = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_task_for_review(
    '60000000-0000-0000-0000-000000000001', array['${taskFileTwo}'::uuid], 'Updated layout'
  ) as version_id
`)).rows[0]?.version_id)
if (!taskVersionTwo || taskVersionTwo === taskVersionOne) throw new Error("Task resubmission did not create a distinct version")
await asUser(supervisor, () => database.query(`select public.review_task_submission('${taskVersionTwo}', 'approved', 'Approved')`))
const approvedTaskSubmission = await database.query(`
  select s.status::text as submission_status, t.status::text as task_status
  from public.submissions s join public.tasks t on t.id = s.task_id
  where t.id = '60000000-0000-0000-0000-000000000001'
`)
if (approvedTaskSubmission.rows[0]?.submission_status !== 'approved' || approvedTaskSubmission.rows[0]?.task_status !== 'approved') {
  throw new Error("Task approval did not persist separately from task completion")
}
const approvalNotificationCount = await asUser(employeeOne, async () => (await database.query(`
  select count(*)::int as count from public.notifications
  where recipient_id = '${employeeOne}' and type = 'submission_approved'
    and entity_id = '60000000-0000-0000-0000-000000000001'
`)).rows[0]?.count)
if (approvalNotificationCount !== 1) throw new Error("Task approval did not notify the task submitter")
await asUser(supervisor, () => database.query(`select public.workflow_update_task_status('60000000-0000-0000-0000-000000000001', 'completed')`))
const completedTaskBeforeClientDecision = await database.query(`select status::text as status, completed_at from public.tasks where id = '60000000-0000-0000-0000-000000000001'`)
if (completedTaskBeforeClientDecision.rows[0]?.status !== 'completed' || !completedTaskBeforeClientDecision.rows[0]?.completed_at) {
  throw new Error("Supervisor could not complete an approved task")
}
await asUser(supervisor, () => database.query(`select public.workflow_trash_task_for_current_user('60000000-0000-0000-0000-000000000001')`))
const completedTaskTrashState = await database.query(`
  select t.deleted_at,
    (select count(*)::int from public.submissions s where s.task_id = t.id) as submissions,
    (select count(*)::int from public.attachments a where a.task_id = t.id) as attachments
  from public.tasks t where t.id = '60000000-0000-0000-0000-000000000001'
`)
if (!completedTaskTrashState.rows[0]?.deleted_at
  || completedTaskTrashState.rows[0]?.submissions !== 1
  || completedTaskTrashState.rows[0]?.attachments !== 2) {
  throw new Error("Completed task Trash did not preserve its submission and files")
}
await asUser(supervisor, () => database.query(`select public.workflow_restore_task_from_trash('60000000-0000-0000-0000-000000000001')`))

const linkedTaskFileOne = "90000000-0000-0000-0000-000000000007"
const linkedTaskFileTwo = "90000000-0000-0000-0000-000000000008"
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, task_id, provider_file_id,
  file_name, mime_type, size_bytes, uploaded_by
) values (
  '${linkedTaskFileOne}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '${linkedContentTaskId}',
  'drive-content-task-one', 'content-task-v1.png', 'image/png', 900, '${employeeOne}'
)`)
const linkedTaskVersionOne = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_task_for_review('${linkedContentTaskId}', array['${linkedTaskFileOne}'::uuid], 'Initial linked work') as version_id
`)).rows[0]?.version_id)
let inaccessibleClientDecisionRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.record_external_client_decision('50000000-0000-0000-0000-000000000001', 'approved', null)`))
} catch (error) { inaccessibleClientDecisionRejected = error?.code === "P0002" }
if (!inaccessibleClientDecisionRejected) throw new Error("An Account Manager without client access recorded an external client decision")

const linkedContentStatusBeforeApproval = await database.query(`select status::text as status from public.content_items where id = '50000000-0000-0000-0000-000000000001'`)
await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('50000000-0000-0000-0000-000000000001', 'approved', null)`))
const approvedLinkedWork = await database.query(`
  select ci.status::text as content_status, ci.client_approval_status, t.status::text as task_status
  from public.content_items ci join public.tasks t on t.content_item_id = ci.id
  where ci.id = '50000000-0000-0000-0000-000000000001' and t.id = '${linkedContentTaskId}'
`)
if (approvedLinkedWork.rows[0]?.content_status !== linkedContentStatusBeforeApproval.rows[0]?.status
  || approvedLinkedWork.rows[0]?.client_approval_status !== "approved"
  || approvedLinkedWork.rows[0]?.task_status !== "for_review") {
  throw new Error(`External client approval altered Jota workflow state: ${JSON.stringify(approvedLinkedWork.rows[0])}`)
}

await asUser(employeeOne, () => database.query(`select public.record_external_client_decision(
  '50000000-0000-0000-0000-000000000001', 'revision_requested', 'Please replace the opening video'
)`))
const reopenedLinkedWork = await database.query(`
  select ci.status::text as content_status, ci.client_approval_status, ci.client_issues, ci.revision_count,
    t.status::text as task_status, t.completed_at, s.status::text as submission_status, s.approved_at,
    (select count(*)::int from public.submission_versions v where v.submission_id = s.id) as version_count
  from public.content_items ci
  join public.tasks t on t.content_item_id = ci.id and t.id = '${linkedContentTaskId}'
  join public.submissions s on s.task_id = t.id
  where ci.id = '50000000-0000-0000-0000-000000000001'
`)
if (reopenedLinkedWork.rows[0]?.content_status !== linkedContentStatusBeforeApproval.rows[0]?.status
  || reopenedLinkedWork.rows[0]?.client_approval_status !== "revision_requested"
  || reopenedLinkedWork.rows[0]?.client_issues !== "Please replace the opening video"
  || reopenedLinkedWork.rows[0]?.revision_count !== 1
  || reopenedLinkedWork.rows[0]?.task_status !== "todo"
  || reopenedLinkedWork.rows[0]?.completed_at !== null
  || reopenedLinkedWork.rows[0]?.submission_status !== "revision_requested"
  || reopenedLinkedWork.rows[0]?.approved_at !== null
  || reopenedLinkedWork.rows[0]?.version_count !== 1) {
  throw new Error(`Client revision did not safely reopen linked work and preserve its first version: ${JSON.stringify(reopenedLinkedWork.rows[0])}`)
}
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, task_id, provider_file_id,
  file_name, mime_type, size_bytes, uploaded_by, created_at
) values (
  '${linkedTaskFileTwo}', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '${linkedContentTaskId}',
  'drive-content-task-two', 'content-task-v2.png', 'image/png', 1100, '${employeeOne}', now() + interval '1 second'
)`)
const linkedTaskVersionTwo = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_task_for_review('${linkedContentTaskId}', array['${linkedTaskFileTwo}'::uuid], 'Revised for the client') as version_id
`)).rows[0]?.version_id)
if (!linkedTaskVersionOne || !linkedTaskVersionTwo || linkedTaskVersionOne === linkedTaskVersionTwo) {
  throw new Error("Task could not be resubmitted after external client revisions")
}
await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('50000000-0000-0000-0000-000000000001', 'approved', null)`))
const clientApprovedResubmission = await database.query(`
  select t.status::text as task_status, s.status::text as submission_status,
    (select count(*)::int from public.submission_versions v where v.submission_id = s.id) as version_count
  from public.tasks t join public.submissions s on s.task_id = t.id where t.id = '${linkedContentTaskId}'
`)
if (clientApprovedResubmission.rows[0]?.task_status !== "for_review"
  || clientApprovedResubmission.rows[0]?.submission_status !== "submitted"
  || clientApprovedResubmission.rows[0]?.version_count !== 2) {
  throw new Error("External client approval incorrectly completed or rewrote the task's internal review workflow")
}

// The new migration is applied after the legacy-data checks above so the
// upgrade path also verifies that existing content remains readable.
await database.exec(await fs.readFile(explicitClientHandoffMigrationPath, "utf8"))
let unreviewedHandoffRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.send_approved_content_to_client('${workflowContentId}')`))
} catch (error) { unreviewedHandoffRejected = error?.code === "22023" }
if (!unreviewedHandoffRejected) throw new Error("Content without internal approval could be sent to the client")

let newWaitingClientRejected = false
try {
  await asUser(administrator, () => database.query(`select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Premature client handoff', 'Instagram', 'Static', null, 'waiting_client', null, null,
    null, null, null, null, null, null
  )`))
} catch (error) { newWaitingClientRejected = error?.code === "22023" }
if (!newWaitingClientRejected) throw new Error("New content could start in Waiting for client without review")

const historicalImport = await asUser(employeeOne, async () => (await database.query(
  "select public.import_content_items_for_current_user($1::jsonb) as result",
  [JSON.stringify([{ ...importRow, title: "Historical waiting-client import", status: "waiting_client", client_approval_status: "pending" }])],
)).rows[0]?.result)
if (historicalImport?.created !== 1) throw new Error("Historical CSV import could not preserve Waiting for client status")

let manualWaitingClientRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_content_tracker_item_for_current_user(
    '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Review content', 'Instagram', 'Reel', null,
    'waiting_client', null, null, null, 'approved', null, null, null, null, '${employeeOne}'
  )`))
} catch (error) { manualWaitingClientRejected = error?.code === "42501" }
if (!manualWaitingClientRejected) throw new Error("Waiting for client could be set without a handoff")

let nonManagerHandoffRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.send_approved_content_to_client('50000000-0000-0000-0000-000000000001')`))
} catch (error) { nonManagerHandoffRejected = error?.code === "42501" }
if (!nonManagerHandoffRejected) throw new Error("A non-Account Manager could record the client handoff")

let prematureClientResponseRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('${workflowContentId}', 'approved', null)`))
} catch (error) { prematureClientResponseRejected = error?.code === "22023" }
if (!prematureClientResponseRejected) throw new Error("A client response was recorded without a handoff")

await asUser(employeeOne, () => database.query(`select public.send_approved_content_to_client('50000000-0000-0000-0000-000000000001')`))
const handedOffContent = await database.query(`select status::text as status, client_approval_status,
  client_handoff_version_id, client_sent_by, client_sent_at from public.content_items
  where id = '50000000-0000-0000-0000-000000000001'`)
if (handedOffContent.rows[0]?.status !== "waiting_client"
  || handedOffContent.rows[0]?.client_approval_status !== "pending"
  || handedOffContent.rows[0]?.client_handoff_version_id !== submittedVersionTwo
  || handedOffContent.rows[0]?.client_sent_by !== employeeOne
  || !handedOffContent.rows[0]?.client_sent_at) {
  throw new Error(`Client handoff state was not recorded: ${JSON.stringify(handedOffContent.rows[0])}`)
}
let pendingStatusChangeRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_content_tracker_item_for_current_user(
    '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Review content', 'Instagram', 'Reel', null,
    'scheduled', null, null, null, 'pending', null, null, null, null, '${employeeOne}'
  )`))
} catch (error) { pendingStatusChangeRejected = error?.code === "42501" }
if (!pendingStatusChangeRejected) throw new Error("A pending client handoff could leave Waiting for client without a response")
let nonManagerResponseRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.record_external_client_decision(
    '50000000-0000-0000-0000-000000000001', 'approved', null
  )`))
} catch (error) { nonManagerResponseRejected = error?.code === "42501" }
if (!nonManagerResponseRejected) throw new Error("A non-Account Manager could record the client response")
let duplicateHandoffRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.send_approved_content_to_client('50000000-0000-0000-0000-000000000001')`))
} catch (error) { duplicateHandoffRejected = error?.code === "22023" }
if (!duplicateHandoffRejected) throw new Error("The same approved version was handed to the client twice")

await asUser(employeeOne, () => database.query(`select public.record_external_client_decision(
  '50000000-0000-0000-0000-000000000001', 'revision_requested', 'Client requested a new opening'
)`))
const clientRevisionContent = await database.query(`select ci.status::text as content_status,
  ci.client_approval_status, t.status::text as task_status
  from public.content_items ci join public.tasks t on t.content_item_id = ci.id
  where ci.id = '50000000-0000-0000-0000-000000000001' and t.id = '${linkedContentTaskId}'`)
if (clientRevisionContent.rows[0]?.content_status !== "revision_requested"
  || clientRevisionContent.rows[0]?.client_approval_status !== "revision_requested"
  || clientRevisionContent.rows[0]?.task_status !== "todo") {
  throw new Error(`Client revision did not reopen content and linked work: ${JSON.stringify(clientRevisionContent.rows[0])}`)
}
let sameVersionResendRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.send_approved_content_to_client('50000000-0000-0000-0000-000000000001')`))
} catch (error) { sameVersionResendRejected = error?.code === "22023" }
if (!sameVersionResendRejected) throw new Error("Client revision could be resent without new internal approval")

const revisedContentFile = "90000000-0000-0000-0000-000000000009"
await database.exec(`insert into public.attachments (
  id, organization_id, client_id, campaign_id, content_item_id, provider_file_id,
  file_name, mime_type, size_bytes, uploaded_by
) values (
  '${revisedContentFile}', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', 'drive-client-revision',
  'creative-client-revision.png', 'image/png', 2100, '${employeeOne}'
)`)
const revisedContentVersion = await asUser(employeeOne, async () => (await database.query(`
  select public.submit_content_for_review(
    '50000000-0000-0000-0000-000000000001', array['${revisedContentFile}'::uuid],
    'Updated after client feedback'
  ) as version_id
`)).rows[0]?.version_id)
await asUser(supervisor, () => database.query(`select public.review_content_submission('${revisedContentVersion}', 'approved', null)`))
await asUser(employeeOne, () => database.query(`select public.send_approved_content_to_client('50000000-0000-0000-0000-000000000001')`))
await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('50000000-0000-0000-0000-000000000001', 'approved', null)`))
const clientApprovedAfterResend = await database.query(`select ci.status::text as content_status,
  ci.client_approval_status, ci.client_handoff_version_id, t.status::text as task_status
  from public.content_items ci join public.tasks t on t.content_item_id = ci.id
  where ci.id = '50000000-0000-0000-0000-000000000001' and t.id = '${linkedContentTaskId}'`)
if (!revisedContentVersion || revisedContentVersion === submittedVersionTwo
  || clientApprovedAfterResend.rows[0]?.content_status !== "waiting_client"
  || clientApprovedAfterResend.rows[0]?.client_approval_status !== "approved"
  || clientApprovedAfterResend.rows[0]?.client_handoff_version_id !== revisedContentVersion
  || clientApprovedAfterResend.rows[0]?.task_status !== "todo") {
  throw new Error(`Client approval after a revised handoff changed completion state: ${JSON.stringify(clientApprovedAfterResend.rows[0])}`)
}
let repeatedClientResponseRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.record_external_client_decision('50000000-0000-0000-0000-000000000001', 'approved', null)`))
} catch (error) { repeatedClientResponseRejected = error?.code === "22023" }
if (!repeatedClientResponseRejected) throw new Error("The same client response could be recorded twice")

await verifyClientApprovalPublication()
await database.exec(await fs.readFile(supervisorContentMigrationPath, "utf8"))
const supervisorIsClientMember = await database.query(`select exists (
  select 1 from public.client_members where client_id = '30000000-0000-0000-0000-000000000001'
    and user_id = '${supervisor}' and removed_at is null
) as is_member`)
if (supervisorIsClientMember.rows[0]?.is_member) throw new Error("Supervisor self-assignment fixture must not be a client member")
const supervisorContentId = await asUser(supervisor, async () => (await database.query(`
  select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Supervisor owned content', 'Instagram', 'Reel', null, 'planned', null, null,
    null, null, null, null, null, '${supervisor}'
  ) as id
`)).rows[0]?.id)
if (!supervisorContentId) throw new Error("Supervisor could not create their own content")
await asUser(supervisor, () => database.query(`select public.update_content_tracker_item_for_current_user(
  '${supervisorContentId}', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', 'Supervisor edited content', 'Instagram', 'Reel',
  null, 'planned', null, null, null, null, null, null, null, null, '${supervisor}'
)`))
const supervisorImport = await asUser(supervisor, async () => (await database.query(
  "select public.import_content_items_for_current_user($1::jsonb) as result",
  [JSON.stringify([{ ...importRow, title: "Supervisor imported own content", status: "planned", assigned_to: supervisor }])],
)).rows[0]?.result)
if (supervisorImport?.created !== 1) throw new Error("Supervisor could not import content assigned to themselves")
let employeeAssignedSupervisorRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Unauthorized supervisor assignment', 'Instagram', 'Reel', null, 'planned', null, null,
    null, null, null, null, null, '${supervisor}'
  )`))
} catch (error) { employeeAssignedSupervisorRejected = error?.code === "22023" }
if (!employeeAssignedSupervisorRejected) throw new Error("Employee could assign a non-member supervisor to content")
let supervisorHandoffReachedWorkflow = false
try {
  await asUser(supervisor, () => database.query(`select public.send_approved_content_to_client('${supervisorContentId}')`))
} catch (error) { supervisorHandoffReachedWorkflow = error?.code === "22023" }
if (!supervisorHandoffReachedWorkflow) throw new Error("Supervisor could not access content handoff workflow")
let supervisorResponseReachedWorkflow = false
try {
  await asUser(supervisor, () => database.query(`select public.record_external_client_decision('${supervisorContentId}', 'approved', null)`))
} catch (error) { supervisorResponseReachedWorkflow = error?.code === "22023" }
if (!supervisorResponseReachedWorkflow) throw new Error("Supervisor could not access client response workflow")

await asUser(employeeOne, () => database.query(`select public.register_notification_push_subscription_for_current_user(
  'https://fcm.googleapis.com/employee-one', repeat('p', 50), repeat('a', 24)
)`))
let arbitraryPushEndpointRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.register_notification_push_subscription_for_current_user(
    'https://localhost/internal', repeat('p', 50), repeat('a', 24)
  )`))
} catch (error) { arbitraryPushEndpointRejected = error?.code === "22023" }
if (!arbitraryPushEndpointRejected) throw new Error("A non-provider push endpoint was allowed")
await database.query(`insert into public.comments (organization_id, task_id, author_id, body)
  values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '${supervisor}', 'Please check this update')`)
const commentAlertCount = await asUser(employeeOne, async () => (await database.query(`
  select count(*)::int as count from public.notifications
  where recipient_id = '${employeeOne}' and type = 'comment_added'
    and entity_id = '60000000-0000-0000-0000-000000000001'
`)).rows[0]?.count)
if (commentAlertCount !== 1) throw new Error("Task comment did not notify its assigned Account Manager")
await database.exec(`update public.tasks set due_at = now() - interval '2 days' where id = '60000000-0000-0000-0000-000000000002';
  update public.tasks set due_at = now() + interval '12 hours' where id = '60000000-0000-0000-0000-000000000003';
  select private.emit_task_due_notifications();`)
const dueAlertCounts = await database.query(`
  select type::text as type, count(*)::int as count from public.notifications
  where recipient_id = '${employeeTwo}' and entity_id in ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003')
  group by type
`)
const dueAlertCountByType = new Map(dueAlertCounts.rows.map((row) => [row.type, row.count]))
if (dueAlertCountByType.get("task_overdue") !== 1 || dueAlertCountByType.get("task_due_soon") !== 1) {
  throw new Error(`Task due reminders are missing or duplicated: ${JSON.stringify(dueAlertCounts.rows)}`)
}
await database.exec("set role service_role")
let claimedPushCount
try {
  claimedPushCount = (await database.query(`select count(*)::int as count from public.claim_notification_push_batch(50)`)).rows[0]?.count
} finally {
  await database.exec("reset role")
}
const claimedPushTypes = await database.query(`select notification.type::text as type, count(*)::int as count
  from public.notification_push_queue queue join public.notifications notification on notification.id = queue.notification_id
  where queue.lease_until is not null group by notification.type`)
const claimedPushCountByType = new Map(claimedPushTypes.rows.map((row) => [row.type, row.count]))
if (claimedPushCount !== 2 || claimedPushCountByType.get("comment_added") !== 1 || claimedPushCountByType.get("task_overdue") !== 1) {
  throw new Error(`Expected one comment and one overdue push for the linked task revision: ${JSON.stringify(claimedPushTypes.rows)}`)
}
const pushDataProtection = await database.query(`
  select has_table_privilege('authenticated', 'public.notification_push_subscriptions', 'select') as users_can_read_subscriptions,
         has_table_privilege('authenticated', 'public.notification_push_queue', 'select') as users_can_read_push_queue,
         has_function_privilege('authenticated', 'public.claim_notification_push_batch(integer)', 'execute') as users_can_claim_push
`)
if (pushDataProtection.rows[0]?.users_can_read_subscriptions !== false
  || pushDataProtection.rows[0]?.users_can_read_push_queue !== false
  || pushDataProtection.rows[0]?.users_can_claim_push !== false) {
  throw new Error("Push endpoints/queue are accessible outside the trusted server")
}
await asUser(employeeOne, () => database.query("select public.set_notification_sound_preference_for_current_user(true)"))
const ownSoundPreference = await asUser(employeeOne, async () => (await database.query("select sound_enabled from public.notification_preferences where user_id = $1", [employeeOne])).rows[0]?.sound_enabled)
const otherSoundPreference = await asUser(supervisor, async () => (await database.query("select count(*)::int as count from public.notification_preferences where user_id = $1", [employeeOne])).rows[0]?.count)
if (ownSoundPreference !== true || otherSoundPreference !== 0) throw new Error("Notification sound preferences are not private to their owner")
const markedRead = await asUser(employeeOne, async () => (await database.query(`
  select public.mark_notification_read_for_current_user(
    (select id from public.notifications where recipient_id = '${employeeOne}' and type = 'revision_requested' limit 1)
  ) as changed
`)).rows[0]?.changed)
if (markedRead !== true) throw new Error("Notification read-state RPC did not mark the recipient's notification")
const reopenedTaskAfterExternalRevision = await database.query(`select status::text as status, completed_at from public.tasks where id = '60000000-0000-0000-0000-000000000001'`)
if (reopenedTaskAfterExternalRevision.rows[0]?.status !== 'todo' || reopenedTaskAfterExternalRevision.rows[0]?.completed_at !== null) {
  throw new Error("External client revisions did not return completed linked work to To do")
}
const restoredCompletedTask = await database.query(`select deleted_at from public.tasks where id = '60000000-0000-0000-0000-000000000001'`)
if (restoredCompletedTask.rows[0]?.deleted_at !== null) throw new Error("Completed task could not be restored after Trash")
let immutableTaskReviewRejected = false
try {
  await database.query(`update public.reviews set comment = 'Changed' where submission_version_id = '${taskVersionOne}'`)
} catch {
  immutableTaskReviewRejected = true
}
if (!immutableTaskReviewRejected) throw new Error("A saved task review decision was mutable")
const authenticatedTaskWorkflowGrants = await database.query(`
  select has_function_privilege('authenticated', 'public.submit_task_for_review(uuid,uuid[],text)', 'execute') as can_submit,
         has_function_privilege('anon', 'public.submit_task_for_review(uuid,uuid[],text)', 'execute') as anon_can_submit,
         has_function_privilege('authenticated', 'public.review_task_submission(uuid,public.review_decision,text)', 'execute') as can_review
`)
if (authenticatedTaskWorkflowGrants.rows[0]?.can_submit !== true
  || authenticatedTaskWorkflowGrants.rows[0]?.anon_can_submit !== false
  || authenticatedTaskWorkflowGrants.rows[0]?.can_review !== true) {
  throw new Error("Task submission/review RPC grants are incorrect")
}

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
if (tombstone.rows[0]?.display_name !== "Deleted employee" || tombstone.rows[0]?.auth_user_id !== null || !tombstone.rows[0]?.purged_at || retainedTaskAssignment.rows[0]?.count !== 3) {
  throw new Error(`Expired account purge did not preserve history: ${JSON.stringify({ tombstone: tombstone.rows[0], retained: retainedTaskAssignment.rows[0] })}`)
}

const dispatchNotificationId = "92000000-0000-0000-0000-000000000001"
const dispatchQueueId = "92000000-0000-0000-0000-000000000002"
await database.query(`insert into public.notifications (
  id, organization_id, recipient_id, type, title, body, entity_type, entity_id, href, dedupe_key
) values (
  '${dispatchNotificationId}', '10000000-0000-0000-0000-000000000001', '${employeeTwo}',
  'task_assigned', 'Push dispatch test', 'Check the queue trigger.', 'task', '${supervisorTaskId}',
  '/tasks', 'push-dispatch-schema-test'
)`)
await database.query(`insert into public.notification_push_queue (
  id, organization_id, recipient_id, notification_id
) values (
  '${dispatchQueueId}', '10000000-0000-0000-0000-000000000001', '${employeeTwo}', '${dispatchNotificationId}'
)`)
const dispatchRequest = await database.query(`select url, headers->>'Authorization' as authorization from net.test_http_calls order by id desc limit 1`)
const dispatchCronJob = await database.query(`select count(*)::int as count from cron.job where jobname = 'dispatch-pending-notification-pushes'`)
const dispatchFunctionAccess = await database.query(`
  select has_function_privilege('authenticated', 'private.request_notification_push_dispatch()', 'execute') as authenticated_can_dispatch,
         has_function_privilege('authenticated', 'private.dispatch_pending_notification_pushes()', 'execute') as authenticated_can_run_recovery
`)
if (dispatchRequest.rows[0]?.url !== "https://jota-test.vercel.app/api/notifications/dispatch"
  || dispatchRequest.rows[0]?.authorization !== "Bearer test-notification-dispatch-secret-123456"
  || dispatchCronJob.rows[0]?.count !== 1
  || dispatchFunctionAccess.rows[0]?.authenticated_can_dispatch !== false
  || dispatchFunctionAccess.rows[0]?.authenticated_can_run_recovery !== false) {
  throw new Error(`Push dispatch configuration or access controls failed: ${JSON.stringify({ request: dispatchRequest.rows[0], cron: dispatchCronJob.rows[0], access: dispatchFunctionAccess.rows[0] })}`)
}

const dispatchCallCountBeforeUnconfiguredTest = await database.query("select count(*)::int as count from net.test_http_calls")
await database.query("delete from vault.decrypted_secrets where name = 'jota_notification_dispatch_secret'")
const notificationWithoutDispatchSecretId = "92000000-0000-0000-0000-000000000003"
await database.query(`insert into public.notifications (
  id, organization_id, recipient_id, type, title, body, entity_type, entity_id, href, dedupe_key
) values (
  '${notificationWithoutDispatchSecretId}', '10000000-0000-0000-0000-000000000001', '${employeeTwo}',
  'task_assigned', 'Push dispatch unconfigured test', 'In-app notifications must still work.', 'task', '${supervisorTaskId}',
  '/tasks', 'push-dispatch-unconfigured-schema-test'
)`)
await database.query(`insert into public.notification_push_queue (
  organization_id, recipient_id, notification_id
) values (
  '10000000-0000-0000-0000-000000000001', '${employeeTwo}', '${notificationWithoutDispatchSecretId}'
)`)
const unconfiguredDispatchCallCount = await database.query("select count(*)::int as count from net.test_http_calls")
const unconfiguredQueueEntry = await database.query(`select count(*)::int as count from public.notification_push_queue where notification_id = '${notificationWithoutDispatchSecretId}'`)
if (unconfiguredDispatchCallCount.rows[0]?.count !== dispatchCallCountBeforeUnconfiguredTest.rows[0]?.count || unconfiguredQueueEntry.rows[0]?.count !== 1) {
  throw new Error(`Missing Vault configuration should skip background push without blocking in-app notifications: ${JSON.stringify({ calls: unconfiguredDispatchCallCount.rows[0], queue: unconfiguredQueueEntry.rows[0] })}`)
}

// Apply the additive reporting migration against populated legacy content.
await database.exec(await fs.readFile(contentReportingCategoriesMigrationPath, "utf8"))
const categoryBackfill = await database.query(`select id, content_category from public.content_items
  where id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003')`)
const categoryById = new Map(categoryBackfill.rows.map((row) => [row.id, row.content_category]))
if (categoryById.get("50000000-0000-0000-0000-000000000001") !== "static"
  || categoryById.get("50000000-0000-0000-0000-000000000003") !== "video") {
  throw new Error(`Known historical formats were not backfilled conservatively: ${JSON.stringify(categoryBackfill.rows)}`)
}
const ambiguousContentId = await asUser(supervisor, async () => (await database.query(`
  select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Ambiguous story format', 'Instagram', 'Story', null, 'planned', null, null, null,
    null, null, null, null, null
  ) as id
`)).rows[0]?.id)
const ambiguousCategory = await database.query(`select content_category from public.content_items where id = '${ambiguousContentId}'`)
if (ambiguousCategory.rows[0]?.content_category !== "other") throw new Error("Ambiguous Story format was guessed as static or video")
await asUser(supervisor, () => database.query(`select public.set_content_category_for_current_user('${ambiguousContentId}', 'video')`))
const correctedCategory = await database.query(`select content_category, content_category_manual from public.content_items where id = '${ambiguousContentId}'`)
if (correctedCategory.rows[0]?.content_category !== "video" || correctedCategory.rows[0]?.content_category_manual !== true) {
  throw new Error("Manual content category correction was not retained")
}
await database.query(`update public.content_items set content_type = 'Carousel' where id = '${ambiguousContentId}'`)
const resetCategory = await database.query(`select content_category, content_category_manual from public.content_items where id = '${ambiguousContentId}'`)
if (resetCategory.rows[0]?.content_category !== "static" || resetCategory.rows[0]?.content_category_manual !== false) {
  throw new Error("Changing the format did not reset manual classification")
}
let invalidCategoryRejected = false
try {
  await asUser(supervisor, () => database.query(`select public.set_content_category_for_current_user('${ambiguousContentId}', 'imaginary')`))
} catch (error) { invalidCategoryRejected = error?.code === "22023" }
if (!invalidCategoryRejected) throw new Error("Invalid reporting category was accepted")
let crossWorkspaceCategoryRejected = false
try {
  await asUser(firstAdministrator, () => database.query(`select public.set_content_category_for_current_user('${ambiguousContentId}', 'video')`))
} catch (error) { crossWorkspaceCategoryRejected = error?.code === "P0002" || error?.code === "42501" }
if (!crossWorkspaceCategoryRejected) throw new Error("A user from another workspace changed a content category")

let unassignedClientCategoryRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.set_content_category_for_current_user('${ambiguousContentId}', 'video')`))
} catch (error) { unassignedClientCategoryRejected = error?.code === "42501" || error?.code === "P0002" }
if (!unassignedClientCategoryRejected) throw new Error("A same-workspace user changed content outside their client access")

await database.exec(`update public.profiles set status = 'inactive', deactivated_at = now() where id = '${employeeTwo}'`)
let inactiveCategoryMutationRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.set_content_category_for_current_user(
    '50000000-0000-0000-0000-000000000002', 'video'
  )`))
} catch (error) { inactiveCategoryMutationRejected = error?.code === "42501" }
await database.exec(`update public.profiles set status = 'active', deactivated_at = null where id = '${employeeTwo}'`)
if (!inactiveCategoryMutationRejected) throw new Error("An inactive user changed a content reporting category")

let anonymousCategoryMutationRejected = false
await database.query("select set_config('request.jwt.claim.sub', '', false)")
await database.exec("set role anon")
try {
  await database.query(`select public.set_content_category_for_current_user('${ambiguousContentId}', 'video')`)
} catch (error) { anonymousCategoryMutationRejected = error?.code === "42501" }
finally { await database.exec("reset role") }
if (!anonymousCategoryMutationRejected) throw new Error("Anonymous access reached the content reporting category RPC")

let directCategoryUpdateRejected = false
try {
  await asUser(supervisor, () => database.query(`update public.content_items
    set content_category = 'video' where id = '${ambiguousContentId}'`))
} catch (error) { directCategoryUpdateRejected = error?.code === "42501" }
if (!directCategoryUpdateRejected) throw new Error("Authenticated users can bypass the content reporting category RPC")

const categoryFunctionAccess = await database.query(`
  select p.prosecdef as security_definer, p.proconfig,
    has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_content_category_for_current_user'
`)
const categoryFunction = categoryFunctionAccess.rows[0]
if (!categoryFunction?.security_definer
  || !categoryFunction.proconfig?.some((setting) => setting === 'search_path=""')
  || categoryFunction.anon_can_execute !== false
  || categoryFunction.authenticated_can_execute !== true) {
  throw new Error(`Content reporting category RPC grants or search path are unsafe: ${JSON.stringify(categoryFunction)}`)
}

async function verifyClientApprovalPublication() {
await database.exec(await fs.readFile(clientApprovalPublicationGuardMigrationPath, "utf8"))
const importGrants = await database.query(`
  select has_function_privilege('authenticated', 'public.import_content_items_for_current_user(jsonb)', 'execute') as can_import,
    has_function_privilege('authenticated', 'private.import_content_items_for_current_user(jsonb)', 'execute') as can_call_impl
`)
if (importGrants.rows[0]?.can_import !== true || importGrants.rows[0]?.can_call_impl !== false) {
  throw new Error("Historical import implementation is directly callable or its public wrapper is inaccessible")
}

let prematurePublicationRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Unapproved new publication', 'Instagram', 'Static', null, 'scheduled', null, null,
    null, null, null, null, null, '${employeeOne}'
  )`))
} catch (error) { prematurePublicationRejected = error?.code === "22023" }
if (!prematurePublicationRejected) throw new Error("A new unapproved item could be scheduled")

const plannedPublicationId = await asUser(employeeOne, async () => (await database.query(`
  select public.create_content_tracker_item_for_current_user(
    '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    'Unapproved transition', 'Instagram', 'Static', null, 'planned', null, null,
    null, null, null, null, null, null
  ) as id
`)).rows[0]?.id)
let unapprovedTransitionRejected = false
try {
  await asUser(employeeOne, () => database.query(`select public.update_content_tracker_item_for_current_user(
    '${plannedPublicationId}', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Unapproved transition', 'Instagram', 'Static',
    null, 'scheduled', null, null, null, null, null, null, null, null, null
  )`))
} catch (error) { unapprovedTransitionRejected = error?.code === "22023" }
if (!unapprovedTransitionRejected) throw new Error("An unapproved item could transition to Scheduled")

const historicalPublishedRow = { ...importRow, title: "Historical published import", status: "published", client_approval_status: null, assigned_to: null }
const historicalPublishedImport = await asUser(employeeOne, async () => (await database.query(
  "select public.import_content_items_for_current_user($1::jsonb) as result",
  [JSON.stringify([historicalPublishedRow])],
)).rows[0]?.result)
if (historicalPublishedImport?.created !== 1) throw new Error("Historical published content import was blocked")
const historicalPublishedId = (await database.query(`select id from public.content_items where title = 'Historical published import'`)).rows[0]?.id
await asUser(employeeOne, () => database.query(`select public.update_content_tracker_item_for_current_user(
  '${historicalPublishedId}', '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', 'Historical published import', 'Instagram',
  'Static graphic', null, 'published', null, null, null, null, 'Waiting on product image', 'Edited historical note',
  null, null, null
)`))
let historicalApprovalBypassRejected = false
try {
  await database.query(`update public.content_items set status = 'scheduled' where id = '${historicalPublishedId}'`)
} catch (error) { historicalApprovalBypassRejected = error?.code === "22023" }
if (!historicalApprovalBypassRejected) throw new Error("A historical unapproved item could change publication status")

await database.query(`update public.content_submissions set status = 'submitted', approved_at = null
  where content_item_id = '50000000-0000-0000-0000-000000000001'`)
let outdatedClientApprovalRejected = false
try {
  await database.query(`update public.content_items set status = 'scheduled'
    where id = '50000000-0000-0000-0000-000000000001'`)
} catch (error) { outdatedClientApprovalRejected = error?.code === "22023" }
await database.query(`update public.content_submissions set status = 'approved', approved_at = now()
  where content_item_id = '50000000-0000-0000-0000-000000000001'`)
if (!outdatedClientApprovalRejected) throw new Error("An approval of an outdated review version allowed scheduling")

await database.query(`update public.content_items set status = 'scheduled' where id = '50000000-0000-0000-0000-000000000001'`)
await database.query(`update public.content_items set status = 'published' where id = '50000000-0000-0000-0000-000000000001'`)
const approvedPublication = await database.query(`select ci.status::text as content_status, t.status::text as task_status
  from public.content_items ci join public.tasks t on t.content_item_id = ci.id
  where ci.id = '50000000-0000-0000-0000-000000000001' and t.id = '${linkedContentTaskId}'`)
if (approvedPublication.rows[0]?.content_status !== "published" || approvedPublication.rows[0]?.task_status !== "todo") {
  throw new Error("Approved publication failed or incorrectly completed its linked task")
}
}

await database.exec(await fs.readFile(videoTaskHandoffMigrationPath, "utf8"))
const videoEditor = "80000000-0000-0000-0000-000000000006"
await database.exec(`
  insert into auth.users (id) values ('${videoEditor}');
  insert into public.profiles (id, organization_id, email, display_name, status) values
    ('${videoEditor}', '10000000-0000-0000-0000-000000000001', 'video-editor@example.test', 'Video Editor', 'active');
  insert into public.user_roles (organization_id, user_id, role_id) values
    ('10000000-0000-0000-0000-000000000001', '${videoEditor}', '20000000-0000-0000-0000-000000000001');
`)
const videoContentId = (await database.query(`insert into public.content_items (
  organization_id, client_id, campaign_id, title, description, platform, content_type, status, created_by
) values (
  '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002', 'Editor handoff reel', 'Cut the launch footage',
  'Instagram', 'Reel', 'planned', '${employeeTwo}'
) returning id, content_category`)).rows[0]
if (videoContentId?.content_category !== "video") throw new Error("Video task fixture was not classified as video")
let missingEditorRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.workflow_create_task_for_content(
    '${videoContentId.id}', 'Edit reel', 'medium', now() + interval '2 days', '${employeeTwo}'
  )`))
} catch (error) { missingEditorRejected = error?.code === "22023"; if (!missingEditorRejected) throw error }
if (!missingEditorRejected) throw new Error("A video task was created without a designated editor")

await asUser(employeeTwo, () => database.query(`select public.set_client_video_editor('30000000-0000-0000-0000-000000000002', '${videoEditor}')`))
let managerSelfAssignmentRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.workflow_create_task_for_content(
    '${videoContentId.id}', 'Edit reel', 'medium', now() + interval '2 days', '${employeeTwo}'
  )`))
} catch (error) { managerSelfAssignmentRejected = error?.code === "22023" }
if (!managerSelfAssignmentRejected) throw new Error("Account Manager could assign linked video work to themself")

const videoTaskId = await asUser(employeeTwo, async () => (await database.query(`select public.workflow_create_task_for_content_with_details(
  '${videoContentId.id}', 'Edit reel', 'medium', now() + interval '2 days', '${videoEditor}',
  'Cut the launch footage', now(), array['Prepare draft', 'Export final']::text[]
) as id`)).rows[0]?.id)
const videoTaskDetails = (await database.query(`select t.description, t.start_at, t.status::text as status, ta.user_id,
  (select array_agg(title order by position) from public.task_checklist_items where task_id = t.id) as checklist
  from public.tasks t join public.task_assignees ta on ta.task_id = t.id and ta.is_primary
  where t.id = '${videoTaskId}'`)).rows[0]
if (videoTaskDetails?.user_id !== videoEditor || videoTaskDetails?.description !== "Cut the launch footage"
  || !videoTaskDetails.start_at || videoTaskDetails.status !== "todo"
  || JSON.stringify(videoTaskDetails.checklist) !== JSON.stringify(["Prepare draft", "Export final"])) {
  throw new Error("Video task handoff did not retain editor, brief, start date, and checklist")
}
const editorNotice = (await database.query(`select count(*)::int as count from public.notifications
  where recipient_id = '${videoEditor}' and type = 'task_assigned' and entity_id = '${videoTaskId}'`)).rows[0]?.count
if (editorNotice !== 1) throw new Error("Video editor was not notified of the linked task")
let managerProgressRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.workflow_update_task_status('${videoTaskId}', 'in_progress')`))
} catch (error) { managerProgressRejected = error?.code === "42501" }
if (!managerProgressRejected) throw new Error("Account Manager started the video editor's task")
await asUser(videoEditor, () => database.query(`select public.workflow_update_task_status('${videoTaskId}', 'in_progress')`))

const staticContentId = (await database.query(`insert into public.content_items (
  organization_id, client_id, campaign_id, title, platform, content_type, status, created_by
) values (
  '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002', 'Manager graphic task', 'Instagram', 'Static image', 'planned', '${employeeTwo}'
) returning id`)).rows[0]?.id
let staticHandoffRejected = false
try {
  await asUser(employeeTwo, () => database.query(`select public.workflow_create_task_for_content(
    '${staticContentId}', 'Create graphic', 'medium', now() + interval '2 days', '${videoEditor}'
  )`))
} catch (error) { staticHandoffRejected = error?.code === "42501" }
if (!staticHandoffRejected) throw new Error("Video exception allowed an Account Manager to delegate static work")
await asUser(employeeTwo, () => database.query(`select public.workflow_create_task_for_content(
  '${staticContentId}', 'Create graphic', 'medium', now() + interval '2 days', '${employeeTwo}'
)`))
const handoffGrant = (await database.query(`select has_function_privilege(
  'authenticated', 'public.workflow_create_task_for_content_with_details(uuid,text,public.task_priority,timestamptz,uuid,text,timestamptz,text[])', 'execute'
) as allowed`)).rows[0]?.allowed
if (handoffGrant !== true) throw new Error("Authenticated role cannot create linked tasks with details")

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

if (tableCount !== 40) {
  throw new Error(`Expected 40 public tables, found ${tableCount}`)
}

if (taskCount !== 9) {
  throw new Error(`Seed plus the supervisor and content handoff cases should produce nine tasks; found ${taskCount}`)
}

if (tablesWithoutRls !== 0) {
  throw new Error(`Unexpected RLS coverage: ${tablesWithoutRls} unchecked table(s)`)
}

if (policyCount !== 37 || postMutationCount !== 3) {
  throw new Error(`Unexpected policy or task mutation coverage: ${policyCount} policies, employee sees ${postMutationCount} tasks`)
}

console.log(`Schema validated: ${migrationFiles.length} migrations applied in filename order, ${tableCount} tables, task assignment/review/comment/due notifications and video editor handoff, password-change notifications, opt-in email notification queue and service-only claim RPC, private push subscriptions and service-only delivery queue, authenticated push-dispatch access denied, queue-triggered dispatch and five-minute recovery cron, missing dispatch configuration does not block in-app notifications, notification RLS/RPCs/triggers, content workflow/import/campaign/content-review/archive/restore and client-approved publication guards, historical CSV imports, immutable task/content versions and decisions, private Drive token/folder tables, client platforms, multi-manager ownership, client status and recoverable Trash, employee provisioning and Trash, profile photo storage policies, service-only password-change requests, first-admin bootstrap, profile updates, reporting-category ACL/client/inactive-user checks, and ${policyCount} policies.`)
await database.close()

# Video coverage and supervisor production

This release adds explicit backup coverage without changing anyone's account role or automatically transferring existing work.

## Workflow

1. Open **Clients → client → Team**. The assigned Account Manager, Supervisor, or Administrator chooses the primary Video Editor and an optional, different backup. Active supervisors and administrators can also be selected as producers. Saving these defaults does not change existing content or task owners.
2. Create content or import a CSV. Choose the primary editor, backup, or yourself in the optional video selection. This selection affects only video rows during import; static rows retain their creator. Content can be saved without an editor. Importing content never creates tasks.
3. Choose **Add task** on the saved content card, or **Add as task** in My Work. For video work, confirm its producer. A client Account Manager or Supervisor may cover it personally, or choose **Unassigned — assign later**. Unassigned work remains in To do and sends no producer notification until assigned.
4. Only the assigned producer can start and progress the task. An Account Manager who handed it to someone else can follow the task but cannot start it on their behalf.
5. To transfer an existing accessible video task, open its details and choose **Reassign task**. Select an eligible producer or Unassigned and provide a reason. The task returns to To do; old and new owners receive notifications when present. Files, comments, immutable submissions/reviews, content ownership, and client defaults remain unchanged. Pending review, approved, completed, cancelled, and trashed tasks cannot be reassigned. Resolve review first or use the normal revision workflow.
6. Submit content-linked production for independent review. This applies to static and video work, including work produced by a Supervisor or Administrator. The submitter cannot approve their own version. Standalone supervisor tasks retain their existing direct-completion behavior.
7. Internal approval still leads to external client approval, then the existing posting schedule flow. Jota does not contact the client or publish to social platforms automatically.

Supervisors retain content creation/import, task creation, accessible client planning, internal reviews, and client-handoff actions. Doing assigned video work does not grant administrator-only account, credential, or system settings access.

## Migration and deployment order

Apply these files to the database used by the target deployment, in order:

1. `supabase/migrations/202611050001_video_backup_role.sql`
2. `supabase/migrations/202611050002_video_production_coverage.sql`

Run the first file separately and let it commit before running the second. PostgreSQL requires the new enum value to be committed before use. Both migrations support retry. The second migration adds `tasks.requires_review` and backfills it for content-linked tasks; it does not change task status, ownership, files, or history. It replaces the affected workflow functions while preserving their signatures and existing grants. The legacy primary-editor RPC preserves the saved backup.

Then deploy the app. An older app can remain online during the database expansion, though its completion button may be rejected for newly protected production work until the new UI is deployed. Deploy both app and database before using the feature. No production migration or release is performed by the local implementation.

Verify schema setup without exposing credentials:

```sql
select exists (
  select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typname = 'client_member_role' and e.enumlabel = 'video_backup'
) as backup_role_exists,
exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks' and column_name = 'requires_review'
) as production_review_flag_exists,
to_regprocedure('public.set_client_video_team(uuid,uuid,uuid)') is not null as team_rpc_exists,
to_regprocedure('public.workflow_reassign_video_task(uuid,uuid,uuid,text)') is not null as reassign_rpc_exists;
```

## Verification

Automated checks: `npm test`, `npm run test:schema`, `npm run typecheck`, `npm run lint`, and `npm run build`. Schema tests use an isolated in-memory PostgreSQL database, not production.

For a manual role handoff, use a test client and separate Account Manager, editor, and reviewer accounts. Save primary/backup, import one static row and one video row, and select the backup. Confirm no task exists until Add task. Create the video task, check its owner and notification, then reassign it with a reason. Confirm To do, preserved files/history, and the old owner's notification. Assign a Supervisor, start work, upload a file, and submit it; their own approval must fail, while another reviewer can decide. Confirm external client approval and scheduling still work. Check an unassigned video task separately. Change client defaults while an old editor still owns active work; their active task and upload access must remain available.

Automated notification tests prove database enqueueing and deduplication. Actual email/desktop delivery and Google Drive upload require the configured staging integrations and the manual check above.

## Rollback

Prefer a forward fix or app-only rollback. Keep the additive enum, backup memberships, and review flag; do not delete assignments or clear review requirements to roll back. Older UI versions do not display backups/reassignment and may show a completion option that the database correctly rejects. Keep the new app deployed if supervisors need to submit production work. If a full database rollback is necessary, prepare and review a dedicated migration against the affected task states first; restoring the old review-bypass function would weaken the independent-review rule.

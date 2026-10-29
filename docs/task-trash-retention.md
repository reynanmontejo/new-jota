# Unified Task Trash

Task Trash replaces the task archive. All task menus use **Move to Trash**;
`/tasks/archive` redirects to `/tasks/trash`. File/content archives retain their
existing behavior.

- Restore one task or use **Restore all** for the unexpired tasks in your view.
- **Empty now** permanently deletes the tasks currently displayed after a
  confirmation. Individual tasks also have a permanent delete button.
- Tasks expire 30 days after being moved to Trash. An hourly cleanup removes
  expired tasks; expired rows awaiting cleanup cannot be restored.
- Bulk changes are atomic, permission checked, and limited to the caller's
  organization and permitted tasks. A denied item rolls back the whole operation.
- Task comments, checklist, assignments, submitted task versions, and task reviews
  are deleted with the task. The immutable activity audit remains.
- Approved content snapshots remain intact. Their attachment records are retained
  under the content scope, so deleting a production task does not break approved
  content downloads. Other task attachment records are removed. Private Google
  Drive copies are retained; this feature does not call the Drive deletion API.

## Apply and verify

Apply `supabase/migrations/202611040001_unified_task_trash_retention.sql` after
`202611030001` to staging before releasing the app. Existing archived tasks move
to Trash, retaining their completed state and history. Existing archive/Trash
rows without an expiry receive a fresh 30-day grace period. Retrying the migration
does not extend their expiry or delete data. No purge runs during migration.

Old archive RPCs remain compatible aliases to the Trash actions during a rolling
release. The old Trash reader retains its result shape. If the new migration is
missing, the updated page retains single-task restore and disables bulk deletion.

Check the cleanup configuration in Supabase SQL Editor:

```sql
select jobname, schedule, active
from cron.job where jobname = 'purge-expired-task-trash';
```

Expected: one active job scheduled `15 * * * *` (hourly at minute 15).
Failures produce `TASK_TRASH_PURGE_FAILED` audit entries with SQLSTATE only and
remain eligible for the next retry. Review `cron.job_run_details` and those audit
entries if expired tasks remain in Trash.

Local verification covers archive migration/retry, legacy actions, scoped bulk
restore/delete, rollback of denied batches, expired restore rejection, service-only
cleanup, job registration, and preservation of approved content assets. UI tests
cover confirmation, failure recovery, expired restore controls, and mixed versions.

## Rollback

Before rollout, retain a database backup and the previous function definitions.
To pause retention, unschedule `purge-expired-task-trash` using `cron.unschedule`;
to disable manual purging, revoke authenticated execute on
`public.workflow_manage_task_trash(uuid[],text)`. Restore the prior app and the
previous archive/Trash RPC definitions only if needed. Keep the added expiry column
until all app versions have been reconciled. Migration-created Trash rows remain
restorable within their grace period; inspect `TASK_ARCHIVED` history to identify
the original archives. Do not reverse all Trash rows into archives. Restore the
three task history triggers to `public.prevent_immutable_record_changes()` if
removing the purge workflow. Permanently purged task history requires a database
backup to recover. This rollback does not remove retained content snapshots.

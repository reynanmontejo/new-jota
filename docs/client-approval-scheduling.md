# Client approval and posting schedule

## Workflow

1. Submit content or its linked production task for supervisor review.
2. A supervisor or administrator approves the submitted version. Content moves
   to **Waiting for client**, with **Client: Waiting on client**. Assigned account
   managers receive a notification. An approved linked task remains internally
   approved and cannot be completed before the client approves its content.
3. The account manager sends the approved assets through the usual external
   channel, then clicks **More details → Mark sent to client** in Content.
4. Record the client's external response. Revision feedback is required and
   returns linked tasks to **To do**. Submit a new asset version for internal
   review after making those changes.
5. Recording **Approved** opens **Set posting schedule**. Select a local date and
   time, then save. Content becomes **Scheduled** and appears in Calendar.
   **Schedule later** keeps the approval; the card offers **Set posting schedule**.

Jota records the schedule; the team publishes through its usual platform.
The panel does not connect to social publishing APIs. Standalone tasks retain
their existing review and completion flow.

## Version safety

Linked task approval creates an immutable content review snapshot of the exact
submitted files, author, and supervisor decision. The original task version and
review are retained. The activity log records the source task and both version IDs.
Finish an existing content/client review before approving another linked task
for that content. A new approved version requires a new external client response.
Client response, scheduling, and completion permissions are checked in PostgreSQL.

## Rollout

- Apply `supabase/migrations/202611030001_client_approval_scheduling.sql` after
  `202611020001` to the target Supabase project, then release the matching app.
  The migration can be rerun safely. It does not backfill or rewrite old approvals,
  completed tasks, historical imports, or posting dates.
- Local verification: `npm run test:schema`, focused Vitest tests, lint,
  `npm run typecheck`, and production build. Hosted acceptance: approve one
  synthetic linked task, record its external client handoff and approval, save a
  future schedule, and confirm it in Calendar using account manager access.
- For an app rollback, keep this migration and its RPCs in place until the matching
  app is restored. Do not reapply whole older migrations: they contain DDL.
- If the workflow itself must be rolled back, first export definitions with
  `pg_get_functiondef` and pause writes. Restore only the previous definitions of
  `review_content_submission` from `202610120001`, `review_task_submission` from
  `202610130001`, and the handoff/response RPCs from `202611010001`. Unsent auto-pending
  content (waiting_client, handoff version present, client_sent_at null) must first
  be returned to in_production with its pending/handoff fields cleared using the
  existing workflow write flags. Keep all immutable versions/reviews/activity logs
  and every recorded external decision. Remove `tasks_guard_client_completion`
  only after restoring the old RPCs. Recheck the pending queue and latest-version
  publication guard before resuming writes. Never reset already sent/approved rows.

## Notification changes

The built-in chime has twice its former gain; the default volume is 85%.
Saved volume and mute choices are retained. Audio is unlocked by a click or key
press anywhere in the app after loading, subject to browser audio rules.
The bell refreshes on reconnect, handles failed read requests, deduplicates live
inserts, and prevents stale fetches from overwriting live updates.

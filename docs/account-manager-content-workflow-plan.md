# Account Manager content workflow implementation plan

## Goal

Make the Account Manager's everyday work match the real four-step process:

1. Check the content calendar for what is due.
2. Create the graphic or other asset in Canva.
3. Submit the content item for supervisor review and respond to feedback.
4. After approval, publish it to the intended social platforms.
5. Let Jota record review, revision, and publishing progress automatically;
   retain spreadsheet export during the transition away from Excel.

Supervisors also assign occasional work that is not on the content calendar.
That work is a standalone task, with its own owner, due date, files, and task
review. It must not be represented as a content item or silently generated
from one.

An Account Manager should not have to understand database concepts, create a
task for every graphic, update the same status in two places, or manually
maintain a duplicate Excel tracker.

## Current state and main gap

- The content tracker supports content records, assignment, dates, statuses,
  client/campaign context, and CSV import.
- Campaigns currently provide required context for content records and the task
  creation RPC requires an existing campaign. Campaigns are useful grouping,
  but should not become an extra daily setup step for supervisors or managers.
- Content items have assignment, schedule, production status, file/version, and
  content-review concepts. Standalone tasks have a separate task submission and
  review lifecycle. Keep those review paths distinct by work type.
- Task creation currently makes the creator the primary assignee; it does not
  provide a supervisor-to-Account-Manager assignment flow. `task_assignees` and
  the `tasks.assign` permission exist, so verify their policies before adding an
  assignment UI/RPC.
- The database has a nullable task-to-content reference, but normal task
  creation does not set it. This plan does not require that link: calendar
  content is assigned through its content item; supervisor-assigned
  non-calendar work is a standalone task.
- Content files/reviews and task files/reviews use different records. Before
  release, verify the local migrations against hosted migration history rather
  than assuming that local implementation means hosted setup is complete.

Therefore, a successful upload under Client files or Task files is not yet the
same as submitting a content graphic for approval. The plan closes that gap
while keeping Tasks available for separate operational work.

### Phase 0 workbook review findings

The workbook's main **REPORT** sheet is a row-based tracker with work date,
deadline, posting date, Account Manager, client, platform(s), content type,
Video/Graphic Editor, work status, final status, client approval/issues,
revision count, notes, next action, week/month, deadline status, and completion.
The sheet also contains many blank template rows; imports must skip these rather
than creating empty work. Platform cells commonly contain multiple platform
names, so preserve the source row and platform text instead of automatically
splitting it into separate records.

The Account Manager and Video/Graphic Editor are separate people fields. In
Jota, `content_items.assigned_to` is currently the creator/editor, while
Account Manager access is represented through client memberships. Several
clients have more than one Account Manager represented in the workbook. Do not
map the editor into the Account Manager field or assume one manager per client.
Before claiming exact item-level ownership or importing manager names, add or
agree an explicit content-item Account Manager mapping. The first My Content
view may safely show all records for the signed-in user's RLS-visible clients,
but must describe that scope accurately rather than implying row-level
assignment.

Map source dates to `work_date`, `deadline_at`, and `publish_at`; client
approval/issues, revision count, notes, and next action already have matching
content fields. Week/month and deadline/completion indicators should normally
be derived from those source fields and workflow status, not manually
maintained as independent competing values. Keep the source workbook unchanged
and preview/import only confirmed populated rows.

## Recommended product shape

### Account Manager: My Content

Make **My Content** the primary daily work view for Account Managers. Show only
content they are assigned to or otherwise allowed to access, with a clear list
or board containing client, content title, platform, due/publish date, current
step, and next action. Include filters for client, platform, and status, plus a
search field.

Opening an item should show its brief, requirements, files/versions, feedback,
and one prominent next action. Keep advanced organization options out of the
main path.

### Supervisor: Review queue

Show items awaiting review, oldest/most overdue first. Each review should open
the exact submitted version, display its client/platform/deadline and submitter,
and provide two clear decisions: **Approve** or **Request changes** with required
feedback for a revision request.

### Administrator: Oversight

Allow organization-wide visibility, assignment/configuration, and reports, but
use the same content records and review history. Do not create a parallel admin
tracker.

### Supervisor: standalone assignments

Use **New task** only for work outside the content calendar—for example, a
one-off request assigned directly by a Supervisor. The task should clearly show
the assigning Supervisor and primary Account Manager, with a client and due
date. Task file submission and task review apply here. Do not route the same
calendar post through both task review and content review.

### Keep the domain boundaries clear

- **Client:** customer account and access boundary.
- **Content item:** one trackable piece of marketing work; the Account Manager's
  equivalent of a spreadsheet row.
- **Campaign:** optional grouping/context. Keep it in the data model, but
  default or preselect it (for example, a client/month or program) so it does
  not block daily work. Do not remove or rename campaign records in this phase.
- **Task:** a separate, non-calendar assignment from a Supervisor (or other
  authorized task creator). Do not automatically make a task for every content
  item or CSV row. For the first release, do not add a content-task link unless
  a real workflow needs distinct, independently assigned work steps for one
  post.
- **File:** attach the draft/final asset directly to its content item and
  version, not merely to the client generally.

The two user paths should remain easy to distinguish:

```text
Calendar work: Content item -> Canva file -> Content review -> Publish -> Published
Supervisor request: Standalone task -> Task files -> Task review -> Complete/Cancel
```

For calendar work, approval is not publication. For a standalone task,
completion is not content approval or publication.

If platforms have different asset requirements, reviewers, or due dates, keep
one item per platform. If the existing workbook treats one row as a shared
cross-platform deliverable, confirm that case during Phase 0 before settling
the content-item/platform relationship.

## Phases and exit checks

### Phase 0 — Confirm the real work and establish a safe baseline

**Work**

- Walk through one normal item with an Account Manager and one Supervisor.
- Map the workbook columns to Jota fields: client, owner(s), content/brief,
  platform, due/work/publish dates, revisions, next action, and status.
- Decide how shared/multi-platform work is represented and who may submit,
  review, or reassign work.
- Confirm whether supervisor-assigned tasks always belong to a client and a
  named campaign. The current schema requires a client; the task RPC requires a
  campaign even though the task table permits a null campaign. If an ad-hoc
  request has no named campaign, decide whether to use a default
  "General / Ongoing" campaign or change the RPC/UI to permit no campaign.
- Confirm what a task owner may move to Trash, who may restore it, and the
  retention window. Distinguish mistaken/duplicate work from legitimate work
  that was stopped (Cancel).
- Record current UI, database schema, migration history, and role permissions.
- Confirm hosted database state before designing any migration. Preserve the
  existing workbook and take a safe copy before any bulk import.

**Exit check**

- One agreed workflow diagram and field mapping exist.
- No unresolved conflict about content ownership, supervisor task assignment,
  multi-platform publishing, review ownership, or what counts as approval. If a
  conflict appears, resolve it before implementation.

### Phase 1 — Simplify the Account Manager experience

**Implementation status (2026-10-06): first UI slice complete locally.** The
Account Manager sidebar now opens a simplified My Content worklist, limited by
the existing client-access/RLS scope, with search and client/status filters,
deadlines, publish dates, next action, and latest feedback. The full tracker is
still available from the worklist. This is deliberately not labeled as
row-level personal assignment: `assigned_to` remains the creator/editor field.

**Work**

- Build a live **My Content** view using existing RLS-scoped content records;
  default to the current user's assignments and show useful empty/loading/error
  states.
- Put the next action at the top of each item: Start work, Continue, Submit for
  review, Address feedback, or Mark published, as applicable.
- Keep the account-manager content card as the assignment for calendar work;
  do not ask the manager to create a duplicate task. Show who owns it and when
  it is due/publishing.
- Reduce the everyday status choices to a small plain-language set. Initially
  map them to the existing content statuses instead of deleting or rewriting
  stored status values:
  - Not started → `planned` (or `idea` when explicitly a concept)
  - In progress → `in_production`
  - In review → `for_review`
  - Changes requested → `revision_requested`
  - Scheduled → `scheduled`
  - Published → `published`
- Leave exceptional states such as waiting on client, rejected, and cancelled
  available where needed, but do not make them prominent in the daily flow.
- Select/default campaign context behind the UI when the user starts or imports
  content. Do not silently create duplicate campaigns or tasks.

**Exit check**

- An Account Manager can find assigned work and see client, platform, deadline,
  status, and next action without visiting Campaigns, Tasks, and Calendar
  separately.
- A calendar content item is visibly the work assignment. No second task is
  created by adding/importing content.
- Supervisors can still find all in-scope work; unauthorized clients remain
  hidden. Existing imported data and task behavior are unchanged.

### Phase 2 — Attach drafts and versions to content items

**Implementation status (2026-10-06): implemented locally.** The additive
`202610120001_content_item_review_workflow.sql` migration adds direct content
file links and immutable submission versions; My Content can upload, preview,
select, and submit files. The authenticated file endpoint remains the only way
to read private media. Hosted application and browser tests remain pending.

**Work**

- Add a direct content-item relationship for attachment/submission metadata.
  Use a new additive migration after checking the hosted schema; do not edit an
  already-applied migration.
- Reuse the existing private Google Drive provider, but distinguish
  **content-item files** from general client and task files in Jota.
- Support draft uploads, replacement as a new version (never overwrite a
  submitted/reviewed version), uploader/time, and a short version note.
- Keep the confirmed 100 MB limit in one shared setting and enforce it in both
  client and server validation. Verify host request-size and memory limits
  before production; use chunked upload if the deployment cannot safely proxy
  files this large.
- Check organization, active account, client access, role permission, file type,
  and size on the server for every operation. Keep Drive files private and
  downloads authorization-checked.

**Exit check**

- An Account Manager can attach a draft to the correct content item and see its
  version history there.
- Client-level and task-level attachments still appear only in their existing
  contexts; no duplicate links or orphaned file records are created.
- Failed database registration cleans up an uploaded Drive object where
  possible and gives a useful safe error.

### Phase 3 — Make submission and supervisor review real

**Implementation status (2026-10-06): implemented locally.** The supervisor
queue loads real pending content submissions, previews submitted images/videos,
and persists approval or change requests. Server-side RPCs require review
permission, prevent self-review and stale-version decisions, and require
feedback for requested changes. Task submissions/reviews are a separate
workflow for standalone, non-calendar assignments—not an alternate review path
for the same content post. Do not treat this as released until the migration
history of the intended Supabase project is verified and role-based smoke tests
pass.

**Work**

- Implement a server-authorized **Submit for review** action that points to one
  immutable content-item version and changes the content workflow status.
- Build a live supervisor queue from submitted content items; remove mock names,
  mock previews, and in-memory-only decisions from the production path.
- Persist approval/revision decisions, reviewer, time, and feedback. Require a
  comment when requesting changes. Prevent self-review and review of a
  superseded version.
- On a revision request, return the item to the Account Manager's actionable
  list and require the next upload to create a new version.
- Notify the submitter when a decision is made. Keep the database as the source
  of truth; notifications are a convenience, not the only record.
- Add narrowly scoped content-review permissions and enforce them on the
  server/data boundary, not just by hiding buttons.

**Exit check**

- Submit → review → approve and submit → request changes → new version paths
  persist across sign-out/sign-in and reload.
- Review decisions are auditable and immutable; self-approval and unauthorized
  review are rejected server-side.

### Phase 4 — Replace manual tracker updates

**Work**

- Update status, next action, timestamps, reviewer, revision count, and activity
  history automatically from workflow actions.
- Make the content tracker and Calendar read the same content records; do not
  require the Account Manager to enter a status a second time.
- Support the real cross-platform publishing case. If one piece of approved
  creative is posted to several platforms, store intended destinations and
  per-platform published state/date/link so one completed destination does not
  falsely mark every destination published. If each platform needs a distinct
  asset, date, or review, represent those as separate content items. Decide this
  during Phase 0 before changing schema or importing multi-platform rows.
- Keep the existing CSV import as a controlled onboarding tool: validate and
  preview before import, detect duplicates, preserve assignments/dates/status,
  and do not generate tasks automatically.
- Add a filtered CSV/XLSX export for managers who still need a spreadsheet
  snapshot. Export is a report, not a second editable source of truth.
- Verify the Recent files view after content files are linked to items; it
  should show only files the signed-in person is authorized to see and link
  back to their content item/client. Complete or correct it if those checks
  fail.

**Exit check**

- Normal work requires no manual spreadsheet status update.
- A content item remains approved until it is actually published; each required
  destination can be confirmed independently when cross-posting applies.
- Import/export round-trips the agreed fields without changing unrelated rows.
- Recent files has correct client/item context and respects role/client access.

### Phase 5 — Support supervisor-created standalone tasks and recover mistakes

**Implementation status (2026-10-08): implemented locally.** The additive
`202610190001_task_assignment_and_trash.sql` migration adds active client-member
assignment, optional campaign context for standalone tasks, owner/Supervisor
Trash and restore RPCs, and immutable activity entries. The task form now lets
Supervisors assign an off-calendar task; employees create tasks for themselves.
Tasks with submissions, comments, or attachments cannot be trashed and must be
cancelled so their history remains intact. Schema and role-flow verification
pass locally. Hosted migration application and browser smoke tests remain
pending; do not treat this as deployed.

**Work**

- Preserve the separate task path for work not present in the content calendar.
  Do not recreate this work as a content item just to reuse the content review
  UI.
- Add a Supervisor/Admin assignee selector using active people who can access
  the selected client. Employees creating their own task may default to
  themselves, subject to the established role policy.
- Extend the server-side task creation RPC to accept/validate the assignee and
  record the actor separately from the assignee. Enforce `tasks.assign` and
  client membership on the server; never trust a client-supplied user ID alone.
- Keep standalone task statuses and review history in the task workflow. Verify
  that only the assigned person and authorized reviewers can see task details
  and files.
- Add a safe task recovery path: confirm before moving an accidental/duplicate
  task to Trash, retain the record with `deleted_at`, support restore for the
  approved role(s), and log both actions. Do not permanently delete task review
  history. A legitimate task that was stopped should be Cancelled; tasks with
  submissions/reviews should retain that history and be cancelled/closed rather
  than erased.
- Define whether creators/assignees can Trash only tasks with no submissions or
  review history; require Supervisor/Admin handling for tasks with history.
- Avoid adding general-purpose task-to-content linking in this slice. Revisit it
  only if a confirmed workflow needs separately assigned subtasks under one
  calendar item.

**Exit check**

- A Supervisor can assign a non-calendar task to the intended Account Manager;
  it appears in that person's task list and not as a content calendar item.
- Task submission/review works without creating or changing a content item.
- An accidental task can be restored by an authorized person; cancelled or
  reviewed work keeps its history and is not silently deleted.

### Phase 6 — Role-based smoke test and staged release

Test with one Account Manager, one Supervisor, one Administrator, and a user
without access to the test client. Use a non-sensitive client and files first.

| Scenario | Expected result |
| --- | --- |
| Account Manager opens My Content | Sees only assigned/authorized items and their next actions |
| Upload draft to an item | File appears under that item with size, uploader, and version |
| Submit draft | Status changes once and the correct Supervisor sees it in the queue |
| Supervisor requests changes | Feedback is required, visible to the Account Manager, and logged |
| Account Manager uploads revised draft | New immutable version; old review history remains |
| Supervisor approves | Approved state and reviewer/time persist; self-review is blocked |
| Account Manager publishes approved content to one/more platforms | Content becomes Published only for destinations actually completed; publication metadata persists |
| Supervisor assigns off-calendar work | Task belongs to the selected Account Manager; no content item is created |
| Task owner submits off-calendar work | Task submission/review is used; the content review queue remains unchanged |
| Authorized user trashes a mistaken task | Task leaves active views, remains recoverable, and action is logged |
| User cancels a real task with history | Task is closed without deleting submissions, comments, or reviews |
| User without client access opens item/file | No client details, attachment metadata, or bytes are disclosed |
| Upload unsupported or over 100 MB file | Clear rejection; no Drive/database orphan is left |
| Refresh or sign out/in | Status, versions, comments, and decisions remain consistent |
| Export tracker | Matches visible records and agreed spreadsheet column mapping |

Deploy only after local/staging checks pass, hosted schema is verified, and the
production upload host is confirmed to accept the selected file size. Hosted
migrations/deployment are separate, explicit release actions.

## Cross-phase safeguards and stop conditions

- Do not model one content item and its graphic as a separate generic task just
  to reuse the current task submission UI.
- Do not automatically create tasks from calendar content, or content items
  from standalone tasks.
- Do not use task review for a calendar post that is already submitted through
  content review. The chosen work record owns its single review history.
- Do not delete Campaigns, Tasks, existing statuses, imports, attachments, or
  review records as part of simplification. Hide or default complexity in the
  interface first; use additive migrations only for the missing content-file
  and review links.
- Do not auto-transition an item to Published just because a supervisor
  approved it. Approval and publishing are different events.
- Never expose Google OAuth secrets, refresh tokens, service-role keys, or
  unrestricted Drive URLs in browser code or logs.
- If a phase finds a schema mismatch, permission leak, file orphan, build/test
  failure, or disagreement with the workbook, stop and fix/document it before
  continuing.
- At each phase gate run typecheck, lint on changed files, relevant unit and
  schema tests, and a production build at release readiness. Re-check hosted
  migration history before any SQL is applied.

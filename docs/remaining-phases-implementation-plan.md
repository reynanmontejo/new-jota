# Remaining implementation plan

## Purpose and delivery rule

This plan completes the marketing-operations workflow without replacing the
existing task and content foundations or introducing unverified production
changes. Work proceeds one phase at a time. A phase is not considered complete
until its acceptance checks pass and the handoff notes any remaining limitations.

**Stop-first rule:** if a phase exposes a build/test failure, authorization or
data-integrity defect, production/schema mismatch, or an unresolved product
decision, pause that phase. Reproduce and document the issue, fix it within the
current phase, rerun its checks, and only then continue. Do not carry a known
blocker into the next phase or conceal it with a fallback/mock state.

## Baseline and scope

Already implemented or locally verified:

- Supabase sign-in, initial administrator setup, profiles, and employee account
  administration, including deactivation and Trash-related migrations.
- Client directory and client creation.
- Persistent task loading and core task actions, with permission-checked task
  workflow RPCs.
- Content tracker create/update/archive, client/campaign/assignee validation,
  CSV preview/import, duplicate skipping, and no automatic task creation.
- Calendar content/deadline views and clickable date cells with day details.
- Local validation currently includes a successful production build, typecheck,
  lint, 8 Vitest tests, and the PGlite schema validation suite.

These checks do not prove that every hosted migration or scheduled job is
current, nor do they validate the user's actual CSV against production data.
The hosted content migrations were applied through the Supabase SQL Editor and
the migration history was repaired after checking live objects. Verify live
catalog state again before any future `supabase db push`.

## Cross-phase change controls

1. **Preserve the current worktree.** It already contains substantial modified
   and untracked work. Before each implementation phase, record `git status`,
   inspect relevant diffs, and avoid resets, cleanups, broad formatting, or
   touching unrelated files. Commit/branch strategy is a maintainer decision.
2. **Keep environments separate.** Develop and test against local Supabase or a
   staging project first. Never import test rows or run a destructive migration
   against production as a verification shortcut. Production changes require a
   reviewed migration, backup/rollback plan, and explicit deployment approval.
3. **Make schema changes additive and ordered.** Use a new timestamped migration
   for each phase that changes the database. Do not edit an already-applied
   migration. Verify the hosted schema and migration history before applying or
   repairing history; do not blindly rerun SQL from the editor or CLI.
4. **Protect authorization at the data boundary.** Every server action/RPC must
   validate authentication, organization scope, active account state, role
   permission, and client/campaign membership. UI visibility is not a security
   check. Never expose the service-role key to client code.
5. **Maintain domain boundaries.** Content items own publish dates; tasks own due
   dates; uploads belong to immutable submission versions; review outcomes are
   separate from task completion. CSV content import must never create tasks.
6. **No silent mock fallback in authenticated mode.** If a database/provider
   request fails, show a useful error and log a safe diagnostic. Do not display
   hardcoded demo records as if they were live workspace data.
7. **At every phase gate**, run typecheck, lint on changed files, relevant unit
   and integration tests, and schema validation if SQL changed. Run the
   production build at the end of each major slice and at release readiness.

## Phase 0 — Stabilize and establish environment parity

**Goal:** ensure all later work starts from a known-good application and a
known-good database state.

### Work

- Record the current route/interaction baseline for administrator, supervisor,
  and employee accounts. Include unauthenticated and deactivated-account cases.
- Check every local migration against the hosted schema. Explicitly confirm the
  profile/admin setup, employee management and both Trash migrations, client
  creation, persistent task workflow, content management, and CSV import.
- Confirm whether the hosted project's `pg_cron` extension and hourly 30-day
  purge job are active. If not, follow the documented supported setup path and
  verify it in a non-production project first.
- Reconcile SQL Editor-applied migrations with Supabase CLI migration history
  before any future `db push`. Do not mark migrations applied until the actual
  hosted objects have been checked.
- Re-test `/calendar` against the intended local server after the invalid
  `content_items -> clients` embedded join was replaced with separate
  RLS-scoped queries. Confirm scheduled items appear and task deadlines remain
  available; if the warning remains, capture the server-side PostgREST error
  and stop here.
- Save current `npm run build`, `npm test`, `npm run test:schema`, typecheck,
  and lint outcomes as the baseline. Keep verification data isolated.

### Exit gate

- No unexplained failing checks or access-denied states for valid active users.
- Local and staging schemas agree with the migration sequence, or the exact
  differences and safe reconciliation steps are documented.
- Account purge scheduling is either verified or explicitly blocked with an
  owner and follow-up action.

### Audit checkpoint — 2026-10-02

The local quality baseline passes: `npm test` (8 tests), `npm run test:schema`
(29 tables / 31 policies), `npm run typecheck`, `npm run lint`, and
`npm run build`. The local `/calendar` route rendered the October 2026 date
grid without the previous scheduled-content warning. That browser session was
an employee test account with no client records, so it did not verify populated
calendar data or the admin/supervisor route matrix.

Read-only checks in the hosted `main` project found:

- `pg_cron` 1.6.4 is installed and `purge-expired-employee-accounts` is active
  hourly (`0 * * * *`).
- Task workflow RPCs, employee provisioning/edit/trash/restore/purge RPCs,
  profile/bootstrap RPCs, and content create/update/archive/import RPCs are
  present.
- `create_client_for_current_user(text,text,text,text)` is absent, although
  the local client-creation server action calls it. As deployed, client
  creation will fail.
- `supabase_migrations.schema_migrations` contains only
  `202609250001`, `202609300001`, `202610010001`, and `202610020001`. This does
  not account for the later local migrations. Some of their database objects
  are already present, so the live database is partially applied and its
  migration ledger is not authoritative for the full live schema.
- The Supabase CLI is unavailable in this environment. No hosted DDL, data, or
  migration history was changed during this audit.
- The owner has authorized repair/deployment, but preflight is still incomplete:
  this is the Free-tier production project, and no local Supabase CLI, `pg_dump`,
  or database password is configured here. A logical backup and a usable
  migration connection are required before production changes. Do not put a
  database password or connection string into chat or commit it to the repo.
- The local dev overlay also reports a hydration mismatch whose DOM diff is
  limited to injected attributes (`bis_skin_checked` and `__processed_…`) from
  browser tooling/extensions, plus a Next.js version-staleness notice. This is
  not evidence of an app markup mismatch; recheck once in a clean browser
  profile before release rather than adding code workarounds for injected DOM.

**Phase 0 is blocked at the hosted migration-parity gate. Do not run `supabase
db push`, replay the migration files in SQL Editor, or begin Phase 1 yet.** First
use a non-production branch/project to reconcile each migration against live
catalog objects, identify precisely which statements are missing or already
applied, and test a forward-only repair for the missing client-creation RPC.
Then review the migration-history repair plan and apply it to production only
with an explicit deployment approval and rollback/backup plan. Re-run the
read-only object/history checks afterward. Also acquire safe test accounts or
another staging environment before claiming the admin/supervisor smoke matrix
is complete.

### Follow-up checkpoint — 2026-10-04 (supersedes the blocked status above)

The historical 2026-10-02 checkpoint accurately records the state at that time,
but its migration-parity blocker has since been resolved:

- A read-only hosted catalog check found no missing required application
  functions before the migration-history repair.
- After that verification, the SQL Editor was used to register the six
  already-present migration versions (`202610030001`, `202610040001`,
  `202610040002`, `202610040003`, `202610050001`, and `202610060001`). The
  hosted ledger now contains ten versions total. Migration files were not
  replayed and no application data was changed by this ledger repair.
- The owner explicitly chose to skip the logical backup. Treat this as a
  recorded risk; do not imply a backup exists.
- Local release checks pass: typecheck, lint, 11 Vitest tests, schema
  validation, and production build. The dashboard review also fixed live-mode
  demo data and task deadline parsing; the demo experience retains its sample
  fixtures.
- Deployment has not happened. The repository has no configured deployment
  target or Git remote, so the next release step is to choose/configure a
  hosting target and then run the role-based smoke matrix against the deployed
  environment. Do not deploy to an assumed provider.

Phase 0 is no longer blocked on migration-history parity. It remains open until
the active admin/supervisor/employee route-and-interaction matrix is exercised
against hosted data and the deployment target is selected. Continue to Phase 1
only after those checks have no unexplained errors.

## Phase 1 — Campaign management foundation

**Dependency:** Phase 0 passes. Campaign management is required for practical
content creation and CSV imports because each content item must belong to a
campaign.

### Work

- Define campaign lifecycle and fields with the owner: name, client, dates,
  status, description/objectives, and archive behavior. Reuse the existing
  `campaigns` schema unless a migration is justified by a concrete missing
  requirement.
- Implement permission-checked campaign create, read, update, and archive
  operations. Enforce same-organization and same-client relationships in the
  database/RPC layer; prevent moving a campaign across clients without an
  explicit supported operation.
- Set client membership/assignment rules and determine who can create, edit,
  archive, and view campaigns. Make the rules consistent with content and task
  access.
- Build a real campaign list/detail flow with search/filter/status and useful
  loading, empty, error, and permission-denied states.
- Connect campaign selectors in content creation/import to active campaigns
  belonging to the selected client. Show clear messages when a client has no
  eligible campaigns.

### Tests and exit gate

- Test authorized CRUD, duplicate/invalid names, archived campaigns, wrong
  client, wrong organization, inactive user, and insufficient permission.
- Confirm unauthorized rows are not visible through direct API/RLS reads.
- Confirm campaigns can be selected for both manually created and imported
  content. No task is created by either path.

### Local implementation checkpoint — 2026-10-04

Implemented locally in `202610070001_campaign_management.sql` and the client
workspace Campaigns tab:

- Campaign create, update, read, and soft-archive are permission-checked in
  security-definer RPCs. Writes derive the organization from the signed-in
  profile, require access to the same client, reject archived clients, invalid
  date ranges, and case-insensitive active-name duplicates, and write activity
  records. A campaign cannot be moved to a different client through update.
- Account Managers/Supervisors can create and update where their role grants
  `campaigns.create`/`campaigns.update`; archiving requires the separate
  `campaigns.delete` permission (Administrator by default).
- The client Campaigns tab now lists and filters real campaign rows and exposes
  only the operations allowed by the user's role. Content selectors continue to
  use non-archived campaigns belonging to accessible clients.
- PGlite tests cover create/update/archive, case-insensitive duplicates,
  invalid dates, inaccessible-client create/update, inactive users, and the
  archive permission boundary. UI tests cover search and archive-control
  visibility. Typecheck, lint, 13 Vitest tests, schema validation, and the
  production build pass.

The initial implementation checkpoint is local-only. A hosted migration
checkpoint was completed on 2026-10-05: migration `202610070001` was applied in
the intended Supabase production project using the SQL Editor's `postgres`
role. Read-only checks confirmed all three RPC signatures exist,
`authenticated` can execute the create function, `anon` cannot, and the
`202610070001` version is recorded in `supabase_migrations.schema_migrations`.
No campaign test records were created. The full browser role matrix remains
open until the app deployment target and suitable test accounts are available;
local PGlite checks continue to cover cross-client, inactive-user, and
permission-denial cases. Wrong-organization and legacy-data behavior remains
part of the Phase 1 exit review.

## Phase 2 — Complete the Client Workspace

**Dependency:** Phase 1 campaign data and access rules pass.

### Work

- Replace placeholder client tabs with live client-scoped views. Implement the
  agreed scope for Overview, Campaigns, Calendar, Tasks, Team, and Activity.
- Use existing client, campaign, content, and task APIs; avoid a second source
  of truth or demo fixtures in authenticated mode.
- Ensure each tab preserves the client context and has correct empty/loading/
  error/access states. Keep query parameters and back navigation stable.
- Implement client-team assignment/removal only if the permission model and
  roster workflow are agreed; otherwise keep it read-only and label it clearly.
- Keep Files visibly unavailable until Phase 3 provides real storage; do not
  present a decorative placeholder as completed functionality.

### Tests and exit gate

- Verify client isolation for two clients and two employee roles, including
  direct URL access to another client's workspace.
- Verify client campaign/task counts match their lists and archived items are
  excluded where appropriate.
- Test all tabs at desktop and mobile widths, including refresh/deep-link.

### Local implementation checkpoint — 2026-10-04

The client workspace now uses client-scoped database reads for its live-mode
Campaigns, Calendar, Tasks, Team, and Activity tabs. Overview shows live
campaign/open-task counts, a short client task list, and the next scheduled
content item. Tasks open the existing task drawer; calendar content and due
dates use the existing calendar/detail flows. Team is explicitly read-only;
roster editing remains in organization administration. Files remains visibly
unavailable until the storage decision and Phase 3 work are complete. Demo
client fixtures remain separate from authenticated Supabase data.

During verification, a content-calendar query failure was found to blank the
entire client record. It now degrades only the calendar content view with the
existing warning while preserving task deadlines and the rest of the workspace.
Core client/campaign/task/team query failures still show an explicit error
state, not demo data.

Local checks pass: `npm run typecheck`, `npm run lint`, `npm test` (13 tests),
`npm run test:schema` (29 tables / 31 policies, including campaign permission
and cross-client RPC checks), `npm run build`, and `git diff --check`. These do
not prove that the hosted campaign migration is applied, nor substitute for
the role-based browser smoke matrix or mobile-device review. No hosted schema,
data, or deployment target was changed.

Before release, exercise all tabs with two differently scoped employee
accounts, verify direct URL denial outside the user's client access, compare
counts to displayed records, and check deep links/mobile layout. Phase 3 has
begun with Google Drive selected and the operating account confirmed. The local
implementation now includes an admin-only OAuth flow, encrypted server-side
refresh-token storage, per-client folders, client/task file lists, uploads, and
authenticated downloads. It is not ready for hosted use until the owner applies
the storage migration, configures Google OAuth credentials, tests the
upload/access boundaries, and configures matching production secrets and
redirect URI.

## Phase 3 — File storage and upload experience

**Dependency:** Google Drive and the operating account are confirmed. The local
implementation uses private app-created folders, the `drive.file` scope, and
app-mediated downloads. It does not create public sharing links.

### Work

- Define accepted file types, maximum size, naming rules, retention, malware
  scanning expectation, and who can upload/download/delete.
- Implement server-side provider credentials and least-privilege authorization.
  Keep secrets server-side; store provider file IDs and safe metadata in the
  database, not public URLs or file contents in browser state.
- Add upload progress, cancellation where supported, retry behavior, success,
  and failure states. Verify the user can see only files they are authorized to
  access. Use expiring download links where applicable.
- Connect the Client Workspace Files tab and task/submission upload UI to the
  same provider abstraction so files are not duplicated across features.

**Implementation status:** the Client Files tab and task file area now share
the same Drive-backed attachment endpoints. Task files are stored as attachments
only; persistent numbered submissions and review state belong to Phase 4. The
current Google Drive attachment cap is 100 MB based on expected video file
sizes. The upload is buffered through the app server, so confirm the hosting
target's body-size and memory limits before relying on 100 MB uploads in
production. The separate versioned Work submission flow is not connected.
No hosted migration has been applied.

### Tests and exit gate

- Test authorization boundaries, unsupported/oversized files, interrupted
  uploads, duplicate names, provider outage, revoked credentials, and safe
  download expiry.
- Confirm no file bytes, service credentials, or unrestricted storage links are
  exposed in browser-visible responses or logs.

## Phase 4 — Persistent submissions, versions, and review

**Dependency:** Phase 3 provides durable, permissioned file references.

### Work

- Persist submission records and immutable numbered versions, including creator,
  timestamp, notes, and provider file references. A new upload creates a new
  version; it must not replace prior submitted/reviewed versions.
- Persist supervisor review decisions and comments. Enforce reviewer identity,
  self-approval prohibition, required revision feedback, and legal status
  transitions in server/database functions—not only the UI.
- Define the state machine for draft, submitted, changes requested, approved,
  and task completion. Keep “approved” and “completed” distinct, with the
  authorized supervisor/admin transition required to complete work.
- Replace demo reviewer names, mock file previews/downloads, and in-memory
  `versions: []` data with real database-backed queue/detail queries.
- Record append-only activity for uploads, submissions, reviews, and status
  changes.

### Tests and exit gate

- Verify a full employee upload → submit → supervisor revision → new version →
  approval → authorized completion flow across separate accounts.
- Verify self-review, employee approval, editing a submitted version, and
  cross-client access are rejected at the server/RLS layer.
- Confirm history remains intact after every transition and on full reload.

## Phase 5 — Live overview, search, and notifications

**Dependencies:** Phases 1–4 provide trustworthy campaign/content/task/review
data.

### Work

- Replace hardcoded Upcoming content and My clients lists with permission-scoped
  data from the existing database. Make counts and date ranges explicit and
  consistent with the Calendar and tracker.
- Implement global and mobile search for agreed entities (tasks, clients,
  campaigns, and content). Define authorization-aware result limits and empty
  states; a search input with no behavior must not remain in the header.
- Replace static notification examples with persisted, recipient-scoped
  notifications for assignments, due dates, revisions, and review decisions.
  Define read/unread and link targets; avoid duplicate notifications on retry.
- Reconcile old/unused header components and route targets after the active
  shell behavior is confirmed; remove dead code only when usage and history have
  been checked.

### Tests and exit gate

- Compare overview figures with source records for supervisor and employee
  accounts; confirm inaccessible clients/tasks never appear in search or counts.
- Verify notifications persist read state, route to the correct record, and
  honor role access.
- Confirm desktop and mobile search controls both work with keyboard and touch.

## Phase 6 — Integrated QA and release readiness

### Work

- Run a role-based smoke matrix: anonymous, active employee, supervisor,
  administrator, deactivated user, restored user, and expired/trash user.
- Run migrations from a clean local database and validate an upgrade path from
  the current staging schema. Review grants, RLS policies, RPC search paths,
  service-role usage, and storage rules.
- Test import edge cases using a representative CSV copy: quoted commas,
  embedded line breaks, BOM, date-only and date-range columns, unknown status,
  duplicate rows, invalid client/campaign/assignee, 250-row boundary, and
  retry after a partial network failure. Do not use the live marketing file as a
  test fixture unless it has been sanitized and approved.
- Test core flows at supported viewport sizes and with keyboard/screen reader
  basics. Verify reduced-motion, focus states, labels, error announcements, and
  no horizontal overflow.
- Update `docs/database-schema.md`, setup instructions, user workflows, known
  limitations, migration procedure, backup/restore procedure, and release
  checklist so docs match shipped behavior.
- Use staging deployment and smoke tests before production. Record rollback
  steps and the migration versions applied.

### Release gate

- Production build, all tests, schema validation, RLS/security checks, and
  staging smoke tests pass.
- No open critical/high-severity defects, unexplained migration drift, or
  unresolved storage/auth decisions.
- Operator runbook, backup/restore path, cron/retention status, and support
  ownership are documented.

## Issue handling and handoff template

For every issue found, record:

1. Phase, route, role, environment, and migration version.
2. Reproduction steps and expected vs. actual behavior.
3. Safe diagnostic evidence (error code/message and relevant request shape;
   never tokens, secrets, or private file contents).
4. Severity and affected data/security boundary.
5. Root cause, minimal fix, tests added, and regression result.
6. Whether staging/production schema or data changed, by whom, and rollback path.

Severity guidance:

- **Critical:** unauthorized data access, secret exposure, destructive data loss,
  or broken authentication for all users. Stop all work and contain first.
- **High:** cross-tenant/client exposure, irreversible incorrect workflow state,
  or production writes failing broadly. Stop the current phase; no later phase
  begins until fixed and tested.
- **Medium:** a key role or core workflow cannot complete, but data is safe.
  Fix before closing the phase.
- **Low:** cosmetic or non-blocking issue with a documented workaround. Log it
  with an owner and due phase; do not mislabel it as complete.

At handoff, state the phase completed, changed files/migrations, tests and
results, any environment changes, open issues, and the exact next approved step.

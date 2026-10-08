# Jota system-readiness implementation plan

## Goal

Verify and close the functional gaps in Jota before adding optional features or
starting production release work. The first priority is proving the Account
Manager content workflow, role boundaries, and file behavior with isolated test
accounts and non-sensitive data.

This plan is for application and workflow readiness. It does not authorize a
production deployment, production data changes, or replaying migrations.

## Current baseline

At the time this plan was written, local checks pass:

- `npm run typecheck`
- `npm run lint`
- `npm test` — 25 tests
- `npm run test:schema` — 35 tables and 36 policies
- `npm run build`

These checks validate the local code and schema test harness. They do not prove
that hosted authorization, Google Drive, role-specific screens, or full browser
workflows work against real accounts.

## Known gaps to keep visible

These are known limitations, not presumed regressions. Confirm whether each is
in scope before implementing it:

1. **Task submissions:** task-file upload is available, but task-specific
   versioned submission and review are not connected. Content-item submission
   and supervisor review are a separate implemented workflow. Decide whether
   operational tasks also need formal review; do not build a second review
   system by accident.
2. **Notifications:** the dashboard currently displays sample notifications;
   read state is browser-local rather than persisted and recipient-scoped.
3. **Search:** global search covers tasks, clients, and campaigns. It does not
   currently search content items or files.
4. **Content assignment meaning:** My Content is scoped to clients a user can
   access. `assigned_to` identifies a creator/editor, not the Account Manager
   responsible for a content row. Do not label client access as personal
   assignment.
5. **CSV status mapping:** the social-calendar importer saves the source status
   as a note and creates new rows as Planned. This is intentional until the
   source status terms are mapped to Jota statuses with the owner.
6. **CSV platform requirement:** the sample calendar has no Platform column, so
   the importer requires a common platform value or a Platform column before
   rows can be added.
7. **Tracker export:** filtered CSV/XLSX export is not part of the verified
   workflow yet.

The known gaps above should be resolved as product decisions after core
readiness testing, unless a smoke test shows that one blocks the agreed daily
workflow.

## Safety and stop-first rules

- Use a staging project or isolated non-production organization and synthetic
  clients/files. Do not use sensitive client data for test uploads.
- Do not run destructive SQL, delete real accounts/files, replay applied
  migrations, or repair migration history as part of this plan.
- Read hosted schema and migration state before proposing any database change.
  If a concrete defect requires schema work, write a new additive migration and
  validate it locally and in staging first.
- Never put OAuth secrets, Supabase keys, refresh tokens, encryption keys, or
  database credentials in test notes, screenshots, chat, logs, or commits.
- A test fails if the expected result depends on a UI-only restriction while a
  direct server/API request succeeds.
- **Issue-first gate:** stop when a reproducible bug, authorization failure,
  data-integrity problem, unexplained server error, or conflicting workflow
  behavior is found. Record it, fix it within the current phase, add a
  regression test, and rerun affected checks before moving on.

## Phase 0 — Establish the test environment and baseline

### Work

1. Confirm the commit under test and verify the worktree is clean.
2. Confirm the staging/test app points only to the intended non-production
   Supabase project and Google Drive OAuth client. Verify configuration without
   displaying secret values.
3. Create or identify separate active test accounts for Account Manager,
   Supervisor, and Administrator roles. Include an employee with no access to
   the test client and a deactivated test account if safely available.
4. Create two synthetic clients, at least one campaign per client, and test
   users with intentionally different client access. Include a client with two
   Account Managers if multi-manager behavior is to be verified.
5. Capture the starting migration versions, role assignments, and relevant
   test-record IDs in a private test log. Do not include credentials or file
   contents.
6. Run the local baseline commands above. Save the output and stop if any check
   fails.

### Exit gate

- The test app and database are confirmed non-production.
- Test roles and clients are distinguishable and have no sensitive data.
- Baseline checks pass, or every failure has an issue record and is fixed first.

## Phase 1 — Verify the Account Manager content workflow

### Scenario A: create and find content

1. Sign in as an Account Manager assigned to the test client.
2. Create one content item with a title/idea, platform, format, and optional
   publish date. Confirm the only campaign is preselected when applicable.
3. Confirm that one tracker item is created, appears in My Content and the full
   tracker, and appears on Calendar only when it has a scheduled/publish date.
4. Confirm that creating a content item does not create a task.
5. Confirm the creator/editor field and Account Manager responsibility are not
   presented as the same assignment.

### Scenario B: import the supplied calendar shape

Use a sanitized copy with headers `Date,Day,Status,Type/Focus,Content Idea,Format`
and a few representative rows.

1. Select the CSV and confirm dates, ideas, focus, and formats appear in the
   preview before import.
2. Choose the client and campaign and enter the common platform, since the CSV
   contains no Platform column.
3. Confirm valid rows become ready, invalid rows explain the exact missing
   field, and no item is created until the user submits.
4. Confirm source statuses are preserved in notes and imported items begin as
   Planned. Verify this behavior is understood and acceptable before importing
   a larger file.
5. Import once, wait for the pending/loading state, and confirm the button
   cannot submit a second time while the request is running.
6. Repeat the same import and confirm duplicates are skipped by the server as
   well as reflected in the preview.
7. Exercise quoted commas, UTF-8 BOM, blank rows, invalid dates, unknown status,
   wrong client/campaign, and the maximum row boundary with synthetic data.

### Exit gate

- Manual creation and CSV import produce the expected records and no tasks.
- Duplicate retries do not create duplicate content.
- Missing data is explained before submission; the preview does not hide
  otherwise valid row details.
- Source status handling is explicitly accepted or recorded as a required
  product change before bulk import.

## Phase 2 — Verify file access, content versions, and review

Run this test with separate Account Manager and Supervisor sessions.

1. Upload a supported synthetic draft to a content item. Confirm the file is
   private, linked to the correct item, and viewable through the authenticated
   app without creating a public Drive link.
2. Confirm image preview and video preview/thumbnail behavior for supported
   formats; verify unsupported formats and oversized files receive clear
   errors.
3. Submit the draft for review. Confirm the correct Supervisor sees the
   submission and the Account Manager cannot approve their own submission.
4. As Supervisor, request changes with feedback. Confirm feedback is required,
   saved, and visible to the Account Manager after refresh and a new sign-in.
5. Upload and submit a revised draft. Confirm it creates a new immutable
   version, while the submitted version and review decision remain available.
6. Approve the new version as Supervisor. Confirm reviewer, decision, and time
   persist, and that approval is distinct from task completion.
7. Verify repeated clicks, browser refreshes, and retry after a failed request
   cannot create duplicate decisions or overwrite a reviewed version.
8. Test a representative large upload near the agreed 100 MB limit in staging.
   Record host memory/body-size behavior and interruption/retry results. Do not
   infer large-file readiness from the client-side limit alone.

### Exit gate

- Submit → request changes → new version → approval persists across reload and
  sign-in.
- Prior versions remain immutable and every operation is authorized server-side.
- Private file bytes and metadata are unavailable to users without access.
- Upload size, type, retry, and provider-failure behavior are understood.

## Phase 3 — Verify client, role, and account boundaries

1. As Account Manager A, create a client and assign one or more authorized
   Account Managers through the supported higher-tier workflow.
2. Confirm the Supervisor sees that client and its progress, and can identify
   which Account Managers have access.
3. Confirm Account Manager B sees the client only when assigned/access is
   granted. Remove one assignment and verify access is revoked as expected.
4. Try direct URLs and direct requests for another client, content item, task,
   attachment, and review. The unauthorized user must receive a denial or
   not-found response without metadata or file bytes.
5. Verify Administrator-only operations, Supervisor review/oversight, and
   Account Manager creation/edit permissions at both the UI and server/RPC
   boundary.
6. Verify deactivation blocks new sign-in/actions. Test restore and Trash
   behavior using only disposable test accounts; do not wait 30 days or delete
   real users to test purge behavior.
7. Verify the scheduled purge job configuration read-only and document how
   retention will be observed safely.

### Exit gate

- Role permissions match the agreed matrix.
- Cross-client direct access is denied for pages, actions, RPCs, and files.
- Multi-manager visibility and removal behave as intended.
- Trash/restore and retention configuration have a safe, verifiable test.

## Phase 4 — Verify calendar, files, search, and resilience

1. Confirm content publish dates and task due dates both appear on Calendar with
   distinct details and correct timezone handling.
2. Confirm recent/client/task/content files show the correct context, filters,
   previews, downloads, and archive state.
3. Verify global search results are scoped to accessible tasks, clients, and
   campaigns. Record that content/files are not included yet unless separately
   implemented and tested.
4. Simulate safe recoverable failures in staging: Drive unavailable, expired or
   revoked OAuth, network interruption, database denial, and an invalid file.
   Confirm useful errors, loading states, retry behavior, and no orphaned Drive
   or database records where cleanup is supported.
5. Check page navigation and form submission at desktop and mobile widths.
   Verify no repeated submissions, clipped content, or loss of filters/context.

### Exit gate

- Calendar dates and linked details are correct for both content and tasks.
- File controls and failure states do not expose public/unscoped data.
- Search does not leak inaccessible records.
- Recoverable errors provide a safe next action and preserve data integrity.

## Phase 5 — Decide and implement optional feature gaps

Do not begin this phase until Phases 0–4 pass.

1. Decide whether task-specific versioned review is needed in addition to
   content-item review. If yes, define the state machine and ownership first;
   reuse review concepts without duplicating content records or decisions.
2. Decide whether content should have a distinct Account Manager owner per row,
   separate from creator/editor assignment and client access.
3. Decide which workflow events should generate persisted notifications, who
   receives them, read/unread behavior, retention, and duplicate suppression.
4. Decide whether global search should include content and files, and define
   permission-scoped result behavior.
5. Decide the export fields and filters needed for managers who still use
   spreadsheets. Treat export as a report, not a second editable source of
   truth.
6. Implement only approved items in separate, reviewable slices. Add an
   additive migration only where a confirmed requirement needs schema changes.

### Exit gate

- Each optional feature has an explicit owner, scope, permission rule, and
  acceptance criteria.
- No feature creates a competing source of truth or bypasses existing RLS/RPC
  boundaries.

## Phase 6 — Final readiness review and handoff

1. Re-run typecheck, lint, all tests, schema validation, and production build.
2. Re-run the role and content workflow smoke matrix after the final code
   changes; do not rely only on results from before a fix.
3. Review migration sequence, grants, RLS, RPC search paths, Drive token
   handling, logs, and secrets exposure.
4. Update the remaining-phases plan and setup/runbook documents so they reflect
   what was actually tested, which hosted migrations are confirmed, and which
   features remain intentionally unimplemented.
5. Deliver a short issue register with severity, reproduction, fix/owner, test
   evidence, and any accepted limitation.

### Readiness decision

The system-readiness phase is complete only when:

- The primary Account Manager content workflow passes end to end with separate
  roles and persistent history.
- No unresolved critical/high severity access, data-integrity, or workflow
  defects remain.
- Required roles cannot access clients/files outside their authorization.
- Automated checks pass and hosted behavior has been exercised in a safe test
  environment.
- Deferred task-review, notifications, ownership, search, and export decisions
  are recorded as either in-scope work or accepted limitations.

Production deployment and production database changes remain a separate release
approval.

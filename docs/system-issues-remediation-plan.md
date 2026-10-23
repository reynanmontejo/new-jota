# System issues remediation plan

## Purpose and scope

This plan tracks the issues identified in the repository health review. It is
an implementation sequence, not authorization to change production services or
database state. Complete phases in order; pause if a gate fails.

### Baseline at plan creation — 2026-10-19

- Repository `master` was clean and matched `origin/master` at commit `4e9b09e`.
- Typecheck, lint, 61 tests, and schema validation passed locally. Schema
  validation covered 40 tables and 37 policies; it does not inspect hosted
  Supabase state.
- The owner confirms email delivery now works and Brevo logs show the sends.
  Treat email as verified and closed for this plan; retain it as a regression
  check, not an open defect.
- Initial `npm audit --omit=dev` reported 8 high-severity findings, including
  Next.js 16.3.6 and transitive `braces` findings.
- The reviewed Next.js advisories identify 16.3.8 as patched for affected
  16.3.x releases ([Draft Mode/cache fill](https://github.com/advisories/GHSA-3w37-wq28-93x7),
  [SSG/ISR cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676)).
  The `braces` advisory currently lists no patched release
  ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
- The owner manually verified hosted `pg_net` is installed with `http_post` in
  `net`, and confirmed the dispatcher function and five-minute Cron job are
  configured in the intended project. End-to-end push delivery remains to be
  tested. Earlier setup encountered a schema mismatch when the migration
  expected `pg_net` in `net`.

## Implementation log

### Phases 0–1 — Local baseline and dependency remediation — 2026-10-19

- **Local baseline complete:** worktree was clean before this plan's edits and
  `master` matched `origin/master` at `4e9b09e`. The Supabase CLI was invoked
  through `npx`, but `migration list --linked` returned 403 (connected account
  lacks the required endpoint privileges), so hosted catalog and migration
  checks remain pending.
- **Dependency changes complete locally:** upgraded `next` and
  `eslint-config-next` to `16.3.8`; moved `shadcn` to dev dependencies because
  the application consumes its stylesheet at build time but does not import its
  runtime code. The Next.js build succeeds with this split.
- `npm audit --omit=dev` now reports zero vulnerabilities. Full `npm audit`
  still reports 9 high findings through development-only `braces@3.0.3` paths
  from `shadcn` and `eslint-config-next`. The reviewed advisory has no patched
  version listed; no forced downgrade or override was applied.
- Post-change verification passed: typecheck, lint, 61 tests, schema validation
  (40 tables / 37 policies), and production build.
- Email is owner-confirmed working with Brevo logs. No email code/config was
  changed in these phases.

### Phase 2 — Hosted push migration verification — pending

The owner completed the manual hosted setup after the initial review: `pg_net`
is present in `net`, the dispatcher function exists, and the five-minute Cron
job is registered. No migration was run by this agent. Verify a Cron execution
and end-to-end push delivery before closing this phase; do not blindly rerun the
migration or move the extension.

### Phase 3 — Documentation refresh — complete locally

Updated the current-status sections in the remaining-phases and system-readiness
plans, replacing stale local test/table/policy counts and recording the owner's
email-delivery confirmation. Older detailed checkpoints remain as historical
notes; hosted deployment and push state are still explicitly unverified.

### Phases 4–5 — Release hardening checkpoint — 2026-10-23

- Verified the committed hosted migration objects and reconciled the Supabase
  migration ledger through `202610310001`; all 38 committed versions are now
  recorded. No application rows were changed and no migration body was replayed.
- Added an ordered clean-schema gate for all 38 migrations and expanded the
  reporting authorization checks. The current suite passes 98 unit tests plus
  schema validation for 40 tables and 37 policies.
- Added a GitHub Actions release gate and fixed two clean-runner-only defects:
  missing Next route type generation and a Help guide Suspense/prerender issue.
- Upgraded Next and `eslint-config-next` to patched `16.4.2`, Vitest to `4.1.12`,
  Vite to `8.3.5`, and shadcn to `4.22.1`. The production dependency audit is
  clean. Remaining audit findings are development-only transitive dependencies
  in ESLint/shadcn tooling with no non-breaking upstream fix available.
- Deployed and verified the Insights and Calendar mobile overflow corrections
  at a 390 px viewport. Final acceptance is still open for separate-role,
  two-session realtime, disposable hosted-service testing, and the upload-limit
  architecture decision.

## Phase 0 — Establish current environment state

**Goal:** Record a trustworthy baseline before changing dependencies or hosted
configuration.

1. Record the deployed Vercel commit and confirm it corresponds to the pushed
   GitHub commit.
2. In Supabase, inspect migration history and read-only catalog state for
   `pg_net`, its installed schema, `net.http_post`, and the push cron job.
3. In Cloudflare, confirm the email worker's five-minute cron is active. Email
   delivery is owner-confirmed working; do not rotate secrets, requeue mail, or
   alter the worker unless a fresh failure is observed.
4. Save sanitized evidence only: commit/version IDs, migration versions,
   extension schema, cron job names/status, and aggregate delivery results.

**Gate:** Each environment and deployment target is identified; no live change
is needed just to gather this evidence.

## Phase 1 — Remediate dependency findings

**Goal:** Remove the affected Next.js version and reduce unnecessary production
dependency exposure without applying a forced downgrade.

1. Upgrade `next` to a compatible patched release (at least 16.3.8 based on the
   reviewed advisory) and align `eslint-config-next` with that release.
2. Verify whether `shadcn` is used by application/runtime code. If it is only a
   project-generation CLI, move it from `dependencies` to `devDependencies` or
   remove it if no longer needed; update the lockfile through the package
   manager.
3. Re-run `npm audit`, `npm audit --omit=dev`, `npm explain braces`,
   typecheck, lint, tests, schema validation, and production build.
4. For `braces`, the reviewed advisory had no patched release. Do not use
   `npm audit fix --force` or an unreviewed override. If it remains through
   tooling, document the dependency path and exposure, keep untrusted patterns
   away from that code path, and re-check for an upstream fix before release.

**Gate:** No affected Next.js release remains; all app checks pass; any
remaining `braces` finding has a documented, reviewed disposition.

## Phase 2 — Make push migration assumptions explicit

**Goal:** Prevent `pg_net` schema placement from causing a migration failure or
leaving the push dispatcher unable to resolve its HTTP function.

1. Use the Phase 0 catalog results to determine whether `pg_net` is installed,
   which schema owns it, and which schema contains `http_post`.
2. Compare that state with
   `supabase/migrations/202610290001_notification_push_dispatch.sql` and its
   `net.http_post` reference. Do not blindly rerun the migration or move an
   existing extension.
3. If the hosted database is already correct, record the actual extension
   schema and verify the trigger/cron references resolve.
4. If correction is required, prepare a forward-only migration or an explicit
   supported setup procedure, test it on a disposable/staging database with
   both a fresh install and the existing-extension case, then review grants,
   search paths, Vault handling, and rollback implications.
5. Apply to production only after staging passes and a backup/rollback plan is
   recorded. Push delivery is optional and separate from the confirmed email
   delivery path.

**Gate:** Either the current hosted push setup is proven correct, or a reviewed
forward fix passes fresh-install and upgrade tests before production approval.

## Phase 3 — Refresh operational documentation

**Goal:** Make the written readiness status match the shipped system and
owner-confirmed services.

1. Update `docs/remaining-phases-implementation-plan.md` and
   `docs/system-readiness-implementation-plan.md` to distinguish historical
   checkpoints from current status.
2. Replace obsolete test/table/policy counts with current validation output,
   while stating clearly that local schema tests do not prove hosted migration
   state.
3. Record email as operationally verified per owner report; retain the
   five-minute worker schedule, opt-in semantics, and a simple regression test.
4. Document push as optional until Phase 2 and the closed-tab browser test pass.
5. Keep the release runbook clear about which checks require Vercel, Supabase,
   Cloudflare, and separate role accounts.

**Gate:** There is one clear current status section and no stale checkpoint is
presented as current work.

## Phase 4 — Run staging regression and access checks

**Goal:** Confirm the recent notification and workflow changes still work with
real role boundaries and hosted integrations.

1. Run a staging smoke matrix for administrator, supervisor, and employee:
   create/assign a task, open its notification, submit/review work, and verify
   each user can access only permitted records.
2. Confirm sound works after the user enables it and clicks the test control;
   distinguish in-app sound (Jota open) from browser/OS push when Jota is closed.
3. Run one new email-alert test to the opted-in test account. Confirm the queue
   state, Cloudflare dispatch result, Brevo acceptance log, and inbox delivery;
   do not use sensitive task text.
4. If push is configured, test one subscribed device with Jota closed, then
   open the notification link and confirm it reaches the intended record.
5. Test mobile layout and basic keyboard operation for the touched flows.

**Gate:** No high-severity authorization/data defects; email remains successful;
all enabled notification channels have a recorded result and limitation.

## Phase 5 — Release and closeout

**Goal:** Ship only verified changes and record the remaining accepted risks.

1. Re-run dependency audit, typecheck, lint, all tests, schema validation, and
   production build on the release commit.
2. Review the final migration diff and verify migration history before any
   hosted SQL change; do not edit already-applied migrations.
3. Deploy to staging, run Phase 4 checks, then deploy to production through the
   normal GitHub/Vercel flow. Confirm the deployed commit and health afterward.
4. Update this plan with completed dates, commit/version IDs, migration IDs,
   test evidence, and explicit deferred items.

**Exit criteria:** No unresolved critical/high issue, verified deployment,
accurate operator docs, and a clear record of optional push status and any
accepted dependency advisory.

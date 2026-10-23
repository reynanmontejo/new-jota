# Release readiness checkpoint — 2026-10-23

## Decision

The current production deployment is operational, and its database migration
history now matches the committed schema. The final release phase remains open
until the live cross-role/realtime matrix is exercised and the production file
upload limit is made truthful.

## Completed in this checkpoint

- Confirmed `master`, `origin/master`, and deployed revision `de99845` were
  aligned before the current QA fixes.
- Verified the production Content, Insights, Help, task, and calendar routes in
  the authenticated Administrator session.
- Verified the live database objects for migrations `202610270001` through
  `202610310001`, including task workflow, notification dispatch/email, optional
  client tasks, video-editor/client approval, explicit client handoff, reporting
  fields/triggers, Cron, Vault secret presence, and reporting RPC ACLs.
- Repaired only the Supabase migration ledger after the object checks passed.
  No migration SQL was replayed and no application record was changed. The
  ledger now has 38 rows, from `202609250001` through `202610310001`.
- Added a clean PGlite preflight that discovers and applies every migration in
  filename order. The populated workflow suite remains separate so additive
  backfills are still tested against legacy rows.
- Added reporting-category authorization checks for anonymous, inactive,
  same-organization/unassigned-client, and direct-table mutation attempts.
- Bounded the Insights content endpoint at 10,000 accessible records and added
  route tests for authentication, pagination, employee scope, database failure,
  and the upper limit.
- Added a GitHub Actions release gate for lint, typecheck, unit tests, ordered
  schema validation, and the production build.
- Checked core routes at a 390 × 844 viewport. Content, Tasks, and Help did not
  overflow. Insights and Calendar exposed implicit CSS-grid overflow; both were
  corrected locally with explicit zero-minimum single-column tracks.
- Basic accessible-name checks found no visible unlabeled buttons or form
  controls and no duplicate element IDs on the inspected core routes.

## Still required before closing final acceptance

1. Deploy the current QA fixes and repeat the 390 px Insights/Calendar overflow
   checks against production.
2. Run the live workflow with separate Administrator, Supervisor, Account
   Manager, Video Editor/Designer, and Employee sessions. Include an unassigned
   same-organization user and a deactivated user for denial checks.
3. In two simultaneous sessions, verify task/content changes, comments, reviews,
   client handoff decisions, notification badges, and calendar changes update
   without a reload and do not duplicate records.
4. Run `supabase db reset` against a disposable local/staging Supabase instance.
   PGlite proves PostgreSQL ordering and application rules, but it mocks hosted
   Auth, Storage, Realtime, Cron, Vault, and `pg_net` behavior.
5. Resolve the upload architecture mismatch. The app advertises and buffers
   files up to 100 MB, while Vercel Functions currently limit request and
   response bodies to 4.5 MB. Choose either direct/resumable browser-to-storage
   uploads or a truthful application limit below the platform ceiling. See the
   [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

Notification sound reliability remains an explicitly deferred item outside
this release checkpoint. Email delivery is a regression check and was already
confirmed through Brevo.

## Release evidence commands

Run from the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run test:schema
npm run build
git diff --check
```

Do not replay already-applied migration files in the production SQL Editor.
Future migration versions must sort after `202610310001`.

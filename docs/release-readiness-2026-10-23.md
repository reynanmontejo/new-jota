# Release readiness checkpoint — 2026-10-23

## Decision

The current production deployment is operational, and its database migration
history now matches the committed schema. The final release phase remains open
until the live cross-role/realtime matrix and large-file transfer are exercised
on the production deployment.

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
  schema validation, and the production build. The gate now generates Next
  route types explicitly and runs on Node 22, so it is independent of local
  build caches and aligned with the installed Supabase packages.
- Fixed the clean-environment Help guide prerender by placing the shared
  dashboard shell's URL-dependent client tree behind a Suspense boundary.
- Upgraded Next and `eslint-config-next` from `16.3.8` to the patched `16.4.2`
  release. `npm audit --omit=dev` now reports zero production vulnerabilities.
  Vitest and its Vite dependency were also moved to patched compatible
  versions; remaining findings are confined to development-only ESLint/shadcn
  transitive dependencies without a currently available fix.
- Checked core routes at a 390 × 844 viewport. Content, Tasks, and Help did not
  overflow. Insights and Calendar exposed implicit CSS-grid overflow; both were
  corrected with explicit zero-minimum single-column tracks. The deployed
  Insights and Calendar pages were then rechecked at 390 × 844 and no longer
  overflow horizontally.
- Basic accessible-name checks found no visible unlabeled buttons or form
  controls and no duplicate element IDs on the inspected core routes.
- Implemented a server-mediated Google Drive resumable upload path: the browser
  sends 4 MiB chunks, the Drive session capability is encrypted and bound to
  the active user and organization, interrupted uploads can query the accepted
  byte range, and the existing 100 MB limit remains. Focused route/token tests
  and the production build pass; a live >4.5 MB transfer is still required.

## Still required before closing final acceptance

1. Run the live workflow with separate Administrator, Supervisor, Account
   Manager, Video Editor/Designer, and Employee sessions. Include an unassigned
   same-organization user and a deactivated user for denial checks.
2. In two simultaneous sessions, verify task/content changes, comments, reviews,
   client handoff decisions, notification badges, and calendar changes update
   without a reload and do not duplicate records.
3. Run `supabase db reset` against a disposable local/staging Supabase instance.
   PGlite proves PostgreSQL ordering and application rules, but it mocks hosted
   Auth, Storage, Realtime, Cron, Vault, and `pg_net` behavior.
4. On the deployed revision, upload and then preview/download a private video
   larger than 4.5 MB through each relevant role. Confirm chunk progress,
   interrupted-transfer recovery, attachment registration, and review linking.
   Vercel limits ordinary Function request/response payloads to 4.5 MB; the new
   upload path stays below that per request, while the existing streaming
   download route still needs a live large-file check. See the
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

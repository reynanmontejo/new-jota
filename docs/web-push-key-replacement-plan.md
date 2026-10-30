# Production web-push key replacement plan

Prepared October 30, 2026. Status: implementation in progress. The reconnection
fix passed 179 tests, lint, TypeScript, and a production build. One replacement
pair has been generated and validated, with a protected local recovery copy;
it has not yet been installed on a host. No production registrations were reset.

Preflight: KVM production is healthy at `0c94e02a556d`; staging and the other VPS
containers are healthy. The production organization has two push registrations
for two users, three preference rows, and nine queue rows. None were pending or
leased at preflight. A private snapshot is stored outside the repository. The
replacement public-key SHA-256 fingerprint is
`98a6911e732cfb29bb1303e238bca12f8d5c3f498566a56be23e300b4631dfdd`.

The registration API also rejects an absent or outdated public-key identifier
with HTTP 409, so a browser page left open during rotation must refresh Settings
before it can save a registration. Deploy client and API together; old clients
can still remove their own endpoint. The user approved the two-registration
production reset and coordinated KVM/Vercel cutover on October 30, 2026.

Production: https://jota.joynoadmin.tech, using Jota New Supabase. The Vercel
deployment remains available for application rollback. Both deployments use the
same production subscription tables and push queue. Jota Staging is separate.

## Why replacement is needed

The original VAPID private key has no saved copy available. Vercel stores its
existing value as a write-only Secret. A public key cannot replace the missing
private key, so KVM needs a new matching pair and browsers need new subscriptions.
Keep the existing CRON_SECRET, recovered from Jota New Vault's
`jota_notification_dispatch_secret`; it is independent of VAPID signing keys.

## Phase 1: Record and protect current state

- Verify production container health, its release/image tag, and root-only
  environment file permissions. Back up the environment file privately.
- Record existing dispatch URL, trigger configuration, recovery cron schedule,
  pending/leased queue counts, and affected production organization IDs.
- Count affected subscriptions and push-enabled users without displaying
  endpoint URLs, encryption material, or private values.
- Prepare a protected backup of affected push registrations and preferences.
  This is an operational snapshot; without the old private key it does not make
  old registrations usable again.
- Identify the exact production scope before any registration reset. Preserve
  notification history, email/sound preferences, and staging data.

Acceptance: affected scope and rollback values are recorded; no production
registration has been reset and no key has changed.

## Phase 2: Make reconnection handle a changed key

Current code in `notification-settings.tsx` uses an existing subscription without
comparing its `options.applicationServerKey` with the active public key. It can
therefore show an old subscription as enabled after a key replacement.

- Compare the browser subscription's application-server key with the server's
  current public key. Show a clear reconnect state for a mismatch; treat an
  unavailable key conservatively rather than reporting successful delivery.
- On the user's explicit reconnect action, unsubscribe the previous local
  registration, remove its scoped server registration, and subscribe with the
  current key. Preserve useful error/retry behavior if any step fails.
- Do not request browser permission or silently reconnect from a focus effect.
- Verify matching-key reuse, changed-key reconnection, denied permission, failed
  unsubscribe, and failed registration. Verify sound and email controls remain
  independent.

Acceptance: the UI cannot report an old-key subscription as working merely
because a subscription exists. Reconnection requires a user action.

## Phase 3: Prepare one replacement pair

- Generate a single matching VAPID public/private pair using the installed
  `web-push` package. Write private output directly to protected storage, not to
  terminal output, source control, chat, or screenshots.
- Make a protected recovery copy and record only a public-key fingerprint in
  rollout notes.
- Prepare these values for the root-only KVM environment and the Vercel
  Production configuration used for rollback:
  `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`.
- Recover and preserve the current CRON_SECRET. Verify it matches the Vault
  dispatch secret without printing either value. Do not rotate Supabase or Drive
  credentials as part of this change.

Acceptance: one validated pair is ready for both production hosts; no consumer
has begun sending to the shared queue with a different key.

## Phase 4: Perform a coordinated cutover

This phase changes production push delivery and resets device registrations. Show
the exact affected counts and obtain the required confirmation immediately before
performing the production reset.

- Pause both initial HTTP push dispatch and cron recovery, allowing active queue
  leases/requests to settle. Keep creation of in-app notifications and the
  separate email dispatcher running.
- Install the pair on KVM and in Vercel Production. Apply runtime changes and
  deploy the matching reconnection behavior. Do not assume editing Vercel's
  settings updates an existing deployment; deploy the rollback build with the
  replacement settings if it will remain a push-capable fallback.
- Reset only the affected production push registrations and their push-enabled
  state. Old registrations cannot be identified reliably by VAPID key or site
  origin because the current subscription table stores neither field.
- Handle pre-cutover pending push attempts explicitly so reenrollment does not
  unexpectedly replay a backlog. Preserve their underlying in-app notifications
  and retain an audit of queue handling; do not reset every queue row for retry.
- Set Vault's dispatch URL to
  `https://jota.joynoadmin.tech/api/notifications/dispatch`, preserving its secret.
- Resume push dispatch only after the new container and authenticated dispatch
  configuration have been checked. Route scheduled dispatch to one host.

Acceptance: the intended KVM release is healthy, both production hosts have
consistent keys where push is enabled, and stale registrations are not being
retried with an incompatible pair.

## Phase 5: Reenroll and prove delivery

- Each user opens the new production site on each desired browser/device and
  enables or reconnects Computer notifications. Existing Chrome permission may
  already be granted; the subscription still needs the replacement key.
- Start with a test recipient and a separate assigning account in another
  browser profile. Assign one synthetic task; do not bulk replay real alerts.
- Verify the desktop notification arrives while the recipient's Jota tab is
  closed but the browser is running, and that clicking opens the correct KVM task.
- Check queue processing and errors. A 200 dispatch response or `processed_at`
  alone is insufficient: a queue item can be skipped when no registration exists.
- Verify a saved subscription survives refresh and that email/bell behavior,
  staging, and the VPS's other applications still work.

Acceptance: real end-to-end delivery and click navigation pass on an enrolled
device; users have clear instructions to reconnect other devices.

## Phase 6: Monitor and preserve rollback

- Watch provider errors, especially 401/403 from incompatible registrations and
  404/410 from expired endpoints. Do not globally delete subscriptions on a
  provider error without confirming whether keys/configuration are the cause.
- Verify recovery cron and certificate/container health after the cutover.
- Preserve the new pair's private recovery copy and the previous app image.
- For an application rollback, retain the replacement keys. Reverting the app
  cannot restore the lost old private key or make its registrations usable.
- If push fails, pause push dispatch while keeping the application, bell, and
  email running. Do not restore stale registrations and claim delivery recovery.

Completion: production push works on KVM, rollback configuration is consistent,
and an accessible private key backup exists.

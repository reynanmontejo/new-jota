# Jota notifications

Jota keeps task notifications in Supabase. The application currently creates
alerts for assignment, review submission, revision/approval decisions, task
comments, due-soon tasks, and overdue tasks. Due reminders are checked hourly:
one reminder when a task is within 24 hours of its due time, then at most one
overdue reminder per task and assignee per day. Completed, approved, cancelled,
deleted, unassigned, and inactive-user tasks are excluded.

Email alerts are separate from browser push. See
[Email notification setup](email-notification-setup.md) for the Brevo and
Cloudflare Worker route; it does not require the push-dispatch migration.

## Apply the database migrations

Apply these in order, checking the hosted database's migration history first and
applying only versions that are missing:

1. `202610170001_task_comment_and_due_notifications.sql`
2. `202610180001_notification_web_push.sql`
3. `202610290001_notification_push_dispatch.sql`

The first adds task comment alerts and installs an hourly Supabase Cron job for
due reminders. It relies on `pg_cron`, which is enabled by the existing account
retention migration. The second adds private per-device push subscriptions and
a server-only push delivery queue. The third triggers prompt dispatch when a
push enters the queue and adds a five-minute Supabase Cron recovery job. These
migrations do not grant employees direct access to push endpoints or the queue.

## Configure Web Push

Web Push is optional. In the repository's `.env.local` and the app host's
server-only environment settings, configure:

```dotenv
WEB_PUSH_VAPID_PUBLIC_KEY=generated-public-key
WEB_PUSH_VAPID_PRIVATE_KEY=generated-private-key
WEB_PUSH_SUBJECT=mailto:your-workspace-admin@example.com
CRON_SECRET=long-random-server-only-secret
```

Generate a VAPID pair with the installed package:

```powershell
npx web-push generate-vapid-keys
```

Generate `CRON_SECRET` in PowerShell without adding a dependency:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
```

Keep the VAPID private key and `CRON_SECRET` out of Git, browser code, screenshots,
and chat. Never prefix them with `NEXT_PUBLIC_`. The VAPID public key is safe to
send to the signed-in browser; the private key is only used by the server.
Restart the app after changing local environment values.

The **Settings → Browser push notifications** control requests permission only
after the user opts in. Each signed-in device has its own subscription. Turning
off push removes that device's subscription and disables the preference when no
other device remains.

## Connect Supabase to the deployed app

Set `CRON_SECRET` and the VAPID values as server-only Vercel Production
environment variables. In Supabase Dashboard → Database → Vault, add:

- `jota_notification_dispatch_url` — `https://<production-domain>/api/notifications/dispatch`
- `jota_notification_dispatch_secret` — the exact same value as Vercel's `CRON_SECRET`

The dispatch endpoint accepts authenticated `POST` requests and claims a bounded
batch from the service-only queue. The database trigger sends the initial
request; Supabase Cron retries eligible queued work every five minutes. The
endpoint returns aggregate counts, not subscription endpoints. Do not expose the
dispatch secret in client code or a public URL. See
[the Web Push delivery guide](web-push-delivery.md) for the end-to-end check and
troubleshooting steps.

## Browser and mobile behavior

- The site must use HTTPS; `localhost` is supported for development.
- The user must explicitly allow notifications in the browser/OS.
- Push is per device/browser profile. Enabling it on one device does not enable
  it everywhere.
- Mobile support depends on the mobile browser and OS version. Jota does not
  install itself as a full app or bypass platform notification restrictions.
- Push is best-effort: providers can expire subscriptions, and the user can
  revoke permission in browser settings at any time.

## Safe verification

Use synthetic tasks and test accounts. Confirm comment, due-soon, and overdue
alerts in the in-app bell first. Then enable push on one test browser, confirm a
new task notification arrives while the Jota tab is closed, click it, and verify
it opens the corresponding task. Do not test using sensitive task titles or
comment text because browser/OS notifications may be visible on a locked screen.

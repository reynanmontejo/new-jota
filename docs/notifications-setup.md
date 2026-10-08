# Jota notifications

Jota keeps task notifications in Supabase. The application currently creates
alerts for assignment, review submission, revision/approval decisions, task
comments, due-soon tasks, and overdue tasks. Due reminders are checked hourly:
one reminder when a task is within 24 hours of its due time, then at most one
overdue reminder per task and assignee per day. Completed, approved, cancelled,
deleted, unassigned, and inactive-user tasks are excluded.

## Apply the database migrations

Apply these in order, checking the hosted database's migration history first and
applying only versions that are missing:

1. `202610170001_task_comment_and_due_notifications.sql`
2. `202610180001_notification_web_push.sql`

The first adds task comment alerts and installs an hourly Supabase Cron job for
due reminders. It relies on `pg_cron`, which is enabled by the existing account
retention migration. The second adds private per-device push subscriptions and
a server-only push delivery queue. Neither migration grants employees direct
access to push endpoints or the queue.

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

## Schedule push delivery

Configure the deployment host's scheduler to `POST` the app's
`/api/notifications/dispatch` endpoint every five minutes and send this header:

```http
Authorization: Bearer <the configured CRON_SECRET>
```

The route claims a bounded batch from the service-only queue, sends Web Push,
removes expired browser endpoints, and retries transient failures up to five
times. It returns only aggregate counts; it does not return subscription
endpoints. Configure the scheduler only on the trusted app host. Do not expose
the secret in client code or a public URL. If no scheduler is configured, users
still get in-app notifications and hourly due reminders, but closed-browser
push will wait in the queue.

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

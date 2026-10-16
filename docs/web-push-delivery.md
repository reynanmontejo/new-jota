# Browser push delivery setup

Jota's service worker can display push notifications while the Jota tab is closed, as long as the browser/device has an active Jota subscription and allows background notifications. Each user must enable browser notifications on every browser/device where they want to receive them.

## Production configuration

1. In Vercel, set these server-only Production environment variables:
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_SUBJECT`
   - `CRON_SECRET` (use a random value with at least 16 characters)
2. Deploy the application so `/api/notifications/dispatch` is available at the production URL. Do not expose `WEB_PUSH_VAPID_PRIVATE_KEY` or `CRON_SECRET` as `NEXT_PUBLIC_*` values.
3. Apply `202610290001_notification_push_dispatch.sql` after the existing web-push migration. The migration adds an asynchronous `pg_net` request after a push-queue insert and a five-minute Supabase Cron recovery job.
4. In Supabase Dashboard → Database → Vault, create two secrets with these exact names:
   - `jota_notification_dispatch_url` — `https://<production-domain>/api/notifications/dispatch`
   - `jota_notification_dispatch_secret` — the exact same value as Vercel's `CRON_SECRET`

Use the production domain only. The migration validates that the URL uses HTTPS and ends at the dispatch endpoint. If Vault values are missing, notifications still save normally; push dispatch is skipped and the cron job logs that configuration is incomplete.

Keep Supabase's `net` schema out of the project's exposed Data API schemas. `pg_net` stores queued request headers, so treat the dispatch bearer value as sensitive and do not expose `net` through PostgREST or copy request headers into logs or screenshots.

## End-to-end check

1. Sign in on a desktop browser, open Jota Settings → Notifications, and enable browser notifications. Confirm browser permission is **Allowed** and Jota says browser notifications are enabled.
2. Close the Jota tab but leave the browser running. Cause a real notification for that account (for example, assign a test task to it).
3. Confirm the operating system shows a Jota notification. Clicking it should open the destination stored on the notification.
4. In Supabase, inspect `public.notification_push_queue`: a delivered row should have `processed_at` populated. For a failed send, inspect `attempts` and `last_error`. Stale browser endpoints returning 404/410 are removed automatically.
5. If dispatch failed, check Supabase Cron run details and recent `net._http_response` rows. Do not copy request headers or secrets into shared logs or screenshots.

The queue trigger provides prompt dispatch. The scheduled job checks eligible, unprocessed rows every five minutes to recover from missed webhooks, temporary endpoint failures, or a Vercel outage. The existing queue lease and retry limit prevent concurrent workers from processing the same row at the same time.

Push notifications are best effort: users can disable them, browsers/operating systems can suppress them, and a fully quit browser or powered-off device may delay delivery. A closed Jota tab by itself should not prevent delivery.

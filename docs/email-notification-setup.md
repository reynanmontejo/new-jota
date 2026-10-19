# Jota email alerts

Jota can send opted-in account users an email when a new in-app notification is
created. Email delivery uses Brevo's transactional email API and a Cloudflare
Worker that polls a private Supabase queue every five minutes. Supabase stores
the notification records and queue; Supabase's email sender is not used. This
setup does not depend on `pg_net` or the unfinished browser-push dispatcher.

## Free-tier limits and sender requirements

Brevo currently lists 300 free sends per day, including transactional email.
Create a verified sender in Brevo before deployment. Brevo permits sender
verification by an email code, but strongly recommends authenticating a domain;
using a free-mail sender can reduce deliverability or cause the sender address
to be rewritten. See [Brevo's free plan](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans),
[sender verification](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email),
and [transactional email API](https://developers.brevo.com/reference/send-transac-email).

Cloudflare Workers Free currently allows 100,000 requests per day and five
Cron Triggers per account; this Worker runs every five minutes. Its work is
bounded to ten messages per run. See [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
Free tiers and provider policies can change; delivery is best effort and has no
SLA.

## Apply the database migration

Check hosted migration history and apply only if missing:

`supabase/migrations/202610300001_email_notification_delivery.sql`

This migration requires `202610160001_persistent_task_notifications.sql` (which
creates the notification table and preferences). It does not require the
`202610290001_notification_push_dispatch.sql` migration and does not install or
call `pg_net`.

Email alerts default to off. A notification is queued only when its recipient
has opted in. Turning email alerts off stops unclaimed messages for that user.
The queue stores notification IDs and retries failed sends with backoff for up
to five attempts. Only the worker's service-role RPC can claim queue contents;
authenticated users cannot read or claim the queue directly.

## Configure Brevo and Cloudflare

1. Create a free Brevo account, enable transactional email, add a sender, and
   verify the sender address. Add your sending domain's DNS authentication
   records if you own a domain.
2. Install Wrangler or run it through `npx`, then authenticate:

   ```powershell
   npx wrangler login
   ```

3. Set the worker secrets interactively. Wrangler prompts for each value; do
   not paste secrets into Git, project config, or chat:

   ```powershell
   npx wrangler secret put SUPABASE_URL --config workers/notification-email-dispatcher/wrangler.toml
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config workers/notification-email-dispatcher/wrangler.toml
   npx wrangler secret put BREVO_API_KEY --config workers/notification-email-dispatcher/wrangler.toml
   npx wrangler secret put BREVO_SENDER_EMAIL --config workers/notification-email-dispatcher/wrangler.toml
   npx wrangler secret put BREVO_SENDER_NAME --config workers/notification-email-dispatcher/wrangler.toml
   npx wrangler secret put APP_BASE_URL --config workers/notification-email-dispatcher/wrangler.toml
   ```

   `APP_BASE_URL` must be Jota's production HTTPS origin, such as
   `https://new-jota.vercel.app`. Use the actual active domain.

4. Deploy the worker and its five-minute schedule:

   ```powershell
   npx wrangler deploy --config workers/notification-email-dispatcher/wrangler.toml
   ```

5. In Jota, open **Settings → Email alerts** and enable the preference for one
   test account. Create a new test notification for that account, wait up to
   five minutes, then check the mailbox and Cloudflare Worker logs. Brevo's
   transactional logs show provider acceptance. A 2xx provider response means
   accepted for delivery, not guaranteed inbox placement.

Emails include notification titles and short body text (which may include
comment excerpts). Enable alerts only for an inbox you control. Clicking the
link requires the user to sign in to Jota. Browser push remains a separate,
paused feature.

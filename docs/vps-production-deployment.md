# Jota production on KVM

Target: `https://jota.joynoadmin.tech` on Hostinger VPS `187.53.140.168`.
Use the existing **Jota New** Supabase project and production accounts/data.
This moves the application host; it does not move or recreate the database.
Keep `jota-staging.joynoadmin.tech`, its Compose project, and its separate
Supabase project unchanged. The VPS's other applications must remain available.

## Release prerequisites

- Record the intended Git commit and current production/VPS state. Use a
  separate checkout at `/opt/jota-production`, pinned to the tested commit.
  Do not merge/push `master` merely to deploy KVM: that also triggers Vercel.
- Verify the Jota New schema against the release. Apply only missing migrations
  after a database backup. This release needs
  `202611040001_unified_task_trash_retention.sql` after `202611030001`.
  See [Task Trash retention](task-trash-retention.md); it schedules permanent
  deletion after 30 days. Migration application has not been confirmed live.
- Keep Vercel available for rollback until all cutover checks pass.

## Production environment

Store `/etc/jota-production/app.env` outside the checkout, owned by root with
mode `0600` (directory `0700`). Populate it through a secure session; never print
secrets, include them in shell commands/history, or commit the file.

Required names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_OWNER_EMAIL
GOOGLE_DRIVE_REDIRECT_URI
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
WEB_PUSH_SUBJECT
CRON_SECRET
```

Use Jota New values, not staging values. Preserve the production Drive token
encryption key: existing stored refresh tokens depend on it. Preserve production
VAPID keys and the dispatch secret. Set the Drive redirect URI to
`https://jota.joynoadmin.tech/api/google-drive/callback` and register that exact
URI in the existing Google OAuth client before testing. Do not disconnect Drive
or generate replacement keys as part of the host move.

The public Supabase values are embedded at build time, so a staging image cannot
be promoted by changing only runtime settings. Build the production image with
the production environment. Brevo credentials stay in the existing Cloudflare
email Worker; they are not needed in the web container.

## Build and verify before cutover

From the pinned `/opt/jota-production` checkout:

```sh
export JOTA_RELEASE="$(git rev-parse --short=12 HEAD)"
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml config --quiet
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml build
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml up -d --no-build --wait --wait-timeout 180
curl --fail --silent --output /dev/null http://127.0.0.1:3103/login
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps
```

The local port must be unused before starting. Only port `127.0.0.1:3103` is
bound; public traffic goes through Nginx. Keep release-tagged Docker images for
rollback. Do not prune the previous image during the rollout.

## DNS and HTTPS

At the authoritative DNS provider, add an **A** record named `jota`, pointing to
`187.53.140.168`. Preserve the root domain and all existing records. Check for
conflicting `jota` A/AAAA/CNAME records before making changes; do not add an AAAA
record without working IPv6 on this VPS.

Inspect the existing Nginx configuration and certificate tooling first. Install
`deploy/vps/nginx.production.conf` as a separate site, checking that no existing
site already owns this hostname. Run `nginx -t` before reloading Nginx. Once DNS
resolves correctly, use the existing Certbot setup to obtain the certificate:

```sh
certbot --nginx -d jota.joynoadmin.tech --redirect
nginx -t
systemctl reload nginx
curl --fail --silent --output /dev/null https://jota.joynoadmin.tech/login
```

Complete any required certificate agreement/account setup explicitly. Do not
publish production login instructions until HTTPS is valid.

## Integrations and acceptance

1. Add exact production authentication redirect paths used by the app to Jota
   New's Supabase URL allowlist. Set its Site URL to the new HTTPS origin after
   login checks; keep the old origin during rollback. Do not broaden wildcards.
2. Sign in with an existing production account. Verify role-scoped clients,
   content/task loading, assignment/review, client approval, and scheduling.
   Use a named synthetic test record for writes and clean it up recoverably.
3. Verify Drive connection status and an existing permitted image/video preview
   and download. Verify an upload with a synthetic file only.
4. Update Cloudflare email Worker's `APP_BASE_URL` to
   `https://jota.joynoadmin.tech`; keep its Supabase and Brevo settings unchanged.
5. Set Jota New Vault `jota_notification_dispatch_url` to
   `https://jota.joynoadmin.tech/api/notifications/dispatch`, keeping the matching
   `jota_notification_dispatch_secret` and app `CRON_SECRET`. Confirm dispatch
   returns authenticated JSON and queue processing succeeds, not an HTML page.
6. Verify bell updates, an opted-in synthetic email and its new link. Browser
   push permission/subscriptions belong to an origin: users need to enable push
   on the new site. Existing Vercel subscriptions do not automatically migrate.
7. Confirm staging and the VPS's other applications still work. Check container
   health, Nginx errors, certificate renewal, and the Trash cleanup job.

Do not delete Vercel or retire the old hostname as part of initial cutover.
Existing links and browser subscriptions may still use it.

## Rollback

Record the prior image tag and environment/integration settings before changes.
For a KVM release rollback, select the retained previous `JOTA_RELEASE` and use
the same Compose `up -d --no-build --wait` command. If KVM itself fails during
initial cutover, direct users to the existing Vercel site and restore Supabase
Site URL, email `APP_BASE_URL`, and Vault dispatch URL to their recorded values.
Do not reverse database migrations automatically; both hosts use Jota New.
Pause Trash retention separately if necessary using its documented procedure.
Preserve all environment files, database data, and other VPS services.

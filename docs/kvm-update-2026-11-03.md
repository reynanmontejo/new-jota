# Deploy the latest Jota update to KVM

Production: **https://jota.joynoadmin.tech**. Repository branch: **staging**.
Run the terminal commands below in the **Hostinger VPS Web Terminal**, not in Windows PowerShell. This updates the existing production installation at `/opt/jota-production` using its existing production environment file. Staging uses a separate checkout, database, and Compose project.

This update contains the password/account loading improvements, verified Google Drive connection indicator, task Trash refresh fix, permanent employee deletion from Trash, and shared page/drawer/calendar animations. File storage and file management are still separate pages; their consolidation is pending.

## Phase 1 — Record the current release and fetch the update

Open Hostinger → VPS → Web Terminal. Paste commands without the `root@...#` prompt. If a paste starts with `^[[200~`, press **Ctrl+C** and type the first `cd` command manually.

```sh
cd /opt/jota-production
pwd
git status --short
git rev-parse HEAD
docker ps --filter label=com.docker.compose.project=jota-production --filter label=com.docker.compose.service=web --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Expected directory: `/opt/jota-production`. **Save the current full commit and running image tag** for rollback. The image is named `jota-production:<tag>`; save the part after the colon too. If the checkout and running release do not match, resolve that before continuing. If `git status --short` lists changes, stop and review them; do not reset, clean, or overwrite them.

After confirming the checkout is clean:

```sh
git fetch origin staging &&
git switch --detach origin/staging &&
git log -1 --oneline
```

Compare the commit with the release commit supplied in chat. The checkout is now pinned to the fetched commit. Do not switch or merge `master` for this KVM update.

## Phase 2 — Apply the one new database migration

Use a database backup/snapshot from before the update. In Supabase, open **Jota New** (the production project used by this KVM site) → **SQL Editor**. First run:

```sql
select
  to_regprocedure('public.finalize_expired_employee_deletion(uuid)') is not null
    as existing_employee_purge_ready,
  to_regprocedure('public.admin_permanently_delete_employee(uuid,uuid,text)') is not null
    as delete_now_ready;
```

- If both are `true`, the required function is already present. Continue to Phase 3.
- If the first is `true` and the second is `false`, open [202611040002_employee_trash_delete_now.sql](../supabase/migrations/202611040002_employee_trash_delete_now.sql), copy the entire file, and run it in **Jota New**. `Success. No rows returned` is expected. Rerun the check; both should be `true`.
- If the first is `false`, stop and reconcile the existing employee Trash migrations first. Do not replay all historical migrations or run a blanket database push.

This migration adds a service-only function. Applying it does not delete any accounts or alter their 30-day schedule. The existing Task Trash and approval migrations remain prerequisites from the previous release. Record this migration through your existing migration-tracking process; do not mark unrelated versions as applied.

Staging testing uses its own Supabase project. Apply the same new migration there separately if you also update staging; never copy production credentials into staging.

## Phase 3 — Build and replace the production container

Return to the VPS terminal at `/opt/jota-production` and run this block. The `&&` operators stop later steps if a command fails. The current container stays running during the build; replacing it can briefly interrupt requests.

```sh
export JOTA_RELEASE="$(git rev-parse --short=12 HEAD)" &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml config --quiet &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml build &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml up -d --no-build --wait --wait-timeout 180 &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps
```

Expected: `web` is running and **healthy** on `127.0.0.1:3103`. If a command fails, inspect that error before retrying. Do not run `docker compose down`, prune old images, or change other VPS services.

Keep `/etc/jota-production/app.env` unchanged. No credential rotation, DNS, Nginx, certificate, Drive reconnection, or notification configuration change is required for this update. Do not print the environment file or run Compose `config` without `--quiet` when sharing output.

## Phase 4 — Verify the deployed release

```sh
git rev-parse --short=12 HEAD
curl --fail --silent --show-error --output /dev/null --write-out 'Local login: %{http_code}\n' http://127.0.0.1:3103/login
curl --fail --silent --show-error --output /dev/null --write-out 'Public login: %{http_code}\n' https://jota.joynoadmin.tech/login
```

Expected: the intended commit, plus **200** for both login checks. These checks prove reachability, not every authenticated feature. Open the production site, reload once to load the new client bundle, and verify:

1. **Login:** password visibility works; account creation has password confirmation and pending indicators.
2. **Navigation:** move between Dashboard, Clients, Content, Calendar, Insights, Files, Employees, and File storage. Page content should fade/rise softly while the header/sidebar stay mounted. Drawers and calendar details use matching easing. Reduced-motion preferences disable the new motion.
3. **Task Trash:** use a disposable test task. Move it to Trash, confirm the board stays in place, then use **Undo**. Keep a filter or table view selected while testing to confirm it stays selected.
4. **Employee Trash:** an administrator should see **Delete permanently**, a typed-email confirmation, and a pending indicator. Opening and cancelling the dialog does not delete anything. Confirm deletion only for an explicitly disposable test account: it cannot be restored afterward. The login account is removed; the stable profile is anonymized so past task/review history survives.
5. **File storage:** a verified Drive connection displays **Connected**. Check an existing permitted preview/download. Do not disconnect a working account for this check.

The database migration does not require permanently deleting a real employee to validate deployment. Local SQL validation already covers authorization, confirmation, failure rollback, history preservation, and retries. Manual browser verification of the new animation remains part of this rollout.

## Rollback if the new application fails

Use the **previous full commit and image tag saved in Phase 1**. Replace the two quoted placeholders before running:

```sh
cd /opt/jota-production
git switch --detach "PASTE_PREVIOUS_FULL_COMMIT" &&
export JOTA_RELEASE="PASTE_PREVIOUS_IMAGE_TAG" &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml up -d --no-build --wait --wait-timeout 180 &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps
```

This reuses the retained old image with the **current** production credentials. Repeat the Phase 4 reachability checks. Leave the additive migration installed during an application rollback; older code does not call its new function. To disable the new deletion capability separately, see [Employee Trash deletion](employee-trash-deletion.md). An application rollback cannot restore permanently deleted accounts.

Pushing this release to GitHub alone does not update the KVM container. Complete Phases 1–4 to deploy it. This guide does not change the Vercel production branch or deployment.

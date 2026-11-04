# Deploy video coverage, the tutorial, and lion branding to KVM

- Production: **https://jota.joynoadmin.tech**
- Checkout: **`/opt/jota-production`**
- Branch supplying this release: **`staging`**
- Production database: **Jota New**

Run the shell commands in **Hostinger → VPS → Web Terminal**. These update the existing production installation. Pushing to GitHub alone does not update the KVM container.

This release includes:

- Client primary and optional backup Video Editors; eligible Account Managers and Supervisors can cover video work explicitly.
- Video tasks may be unassigned until a producer is chosen. Reassignment preserves files/history and notifies owners. Client-default changes do not transfer existing tasks.
- All content-linked production requires independent review, including Supervisor-owned work. Their standalone tasks retain the existing direct-completion behavior.
- A one-minute tutorial, captions, transcript, and written-guide links in Help Center.
- The approved lion wordmark for login, expanded/collapsed sidebars, light/dark themes, browser icons, and notification icons. The tutorial's earlier recorded branding is unchanged.

**Order:** record the current release → fetch the update → apply two SQL files separately → build/deploy → verify.

Keep `/etc/jota-production/app.env` and the separate staging installation unchanged. This update needs no DNS/Nginx/certificate changes, credential rotation, VAPID replacement, Drive reconnection, or Cloudflare Worker deployment. Do not print the environment file or share secret values.

## Phase 1 — Record the current release, then fetch

Type the first `cd` command manually if pasting into Hostinger adds `^[[200~`. Copy only the commands, not a `root@...#` prompt.

```sh
cd /opt/jota-production
pwd
git status --short
git rev-parse HEAD
docker ps --filter label=com.docker.compose.project=jota-production --filter label=com.docker.compose.service=web --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Expected directory: `/opt/jota-production`. **Save the full current commit and the running `jota-production:<tag>` image tag for rollback.** If the checkout and running release differ, resolve that first. If `git status --short` lists changes, review them before proceeding; do not reset, clean, or overwrite them.

After confirming the checkout is clean:

```sh
git fetch origin staging &&
git switch --detach origin/staging &&
git log -1 --oneline
```

Compare the displayed commit with the final release commit supplied in chat. If they differ, check which release you intend to deploy before continuing. Do not merge or push `master` for this update; that is a separate Vercel production release path.

## Phase 2 — Apply the database migrations separately

Use a current database backup/snapshot before changing production. Open **Supabase → Jota New → SQL Editor**. Confirm that this is the production project used by `jota.joynoadmin.tech`, not Jota Staging.

First verify the earlier release prerequisites:

```sql
select
  to_regprocedure('public.workflow_create_task_for_content_with_details(uuid,text,public.task_priority,timestamptz,uuid,text,timestamptz,text[])') is not null as content_task_rpc_ready,
  to_regprocedure('public.schedule_client_approved_content(uuid,timestamptz)') is not null as client_scheduling_ready,
  to_regprocedure('public.workflow_manage_task_trash(uuid[],text)') is not null as task_trash_ready,
  to_regprocedure('public.admin_permanently_delete_employee(uuid,uuid,text)') is not null as employee_trash_ready;
```

All four should be `true`. If an earlier prerequisite is missing, reconcile it using the [previous KVM update guide](kvm-update-2026-11-03.md) and the [production runbook](vps-production-deployment.md) before continuing. Do not replay every historical migration or run a blanket database push to repair uncertain migration history.

Then apply these **two files, in this exact order**:

1. Open [202611050001_video_backup_role.sql](../supabase/migrations/202611050001_video_backup_role.sql), copy the entire file into a new SQL query, and click **Run**. Wait for it to finish.
2. Open a **separate query**. Copy the entire [202611050002_video_production_coverage.sql](../supabase/migrations/202611050002_video_production_coverage.sql) and click **Run**.

Do not combine the files into one transaction. PostgreSQL must commit the new `video_backup` enum value before the next file uses it. Both files support retry; `Success. No rows returned` is expected. Record the two applied versions through your existing migration-tracking process; SQL Editor execution does not automatically update the Supabase migration ledger.

The second file adds/backfills the review flag for content-linked tasks and updates the workflow functions. It preserves task status, assignments, files, comments, and review history. Older pages may offer a completion action that the new database correctly rejects until the new app is deployed; complete Phase 3 during the same rollout.

Run this verification query afterward:

```sql
select exists (
  select 1 from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'client_member_role'
    and e.enumlabel = 'video_backup'
) as backup_role_exists,
exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks' and column_name = 'requires_review'
) as production_review_flag_exists,
to_regprocedure('public.set_client_video_team(uuid,uuid,uuid)') is not null as team_rpc_exists,
to_regprocedure('public.workflow_reassign_video_task(uuid,uuid,uuid,text)') is not null as reassign_rpc_exists;
```

All four should be `true`. Stop and inspect any SQL error before deploying the app. Additional workflow and rollback details are in [Video production coverage](video-production-coverage.md).

## Phase 3 — Build and deploy the production container

Return to the VPS terminal. This block checks the Compose configuration, builds with the existing production environment, then replaces only the production `web` service. The old container stays online during the build; replacement can briefly interrupt requests.

```sh
cd /opt/jota-production &&
export JOTA_RELEASE="$(git rev-parse --short=12 HEAD)" &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml config --quiet &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml build web &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml up -d --no-build --wait --wait-timeout 180 web &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps
```

Expected: `web` is **healthy**, using `jota-production:<new commit tag>`, bound to `127.0.0.1:3103`. The `&&` operators prevent later steps from running after a failure. Keep the previous Docker image for rollback. Do not run `docker compose down`, prune images, or change the staging/other VPS services.

If the build fails, inspect the build error; the prior container should still be serving traffic. If startup/health verification fails, inspect the service locally:

```sh
cd /opt/jota-production &&
export JOTA_RELEASE="$(git rev-parse --short=12 HEAD)" &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml logs --tail=60 web
```

Review logs before sharing them and redact any personal data or sensitive values. Do not run Compose `config` without `--quiet` when sharing output.

## Phase 4 — Confirm reachability and release assets

```sh
cd /opt/jota-production &&
git rev-parse --short=12 HEAD &&
curl --fail --silent --show-error --output /dev/null --write-out 'Local login: %{http_code}\n' http://127.0.0.1:3103/login &&
curl --fail --silent --show-error --output /dev/null --write-out 'Public login: %{http_code}\n' https://jota.joynoadmin.tech/login &&
curl --fail --silent --show-error --output /dev/null --write-out 'Lion icon: %{http_code}\n' https://jota.joynoadmin.tech/brand/joyno-task-notification-v1.png
```

Expected: the intended release commit and **200** for each URL. A login or icon check proves reachability, not the authenticated workflow. If local succeeds but public fails, inspect the existing reverse-proxy path rather than replacing DNS or Nginx configuration blindly.

## Phase 5 — Verify the workflow in the browser

Open the production site and refresh once to load the new app bundle. Use an existing test client and synthetic data, with separate Account Manager, producer, and reviewer accounts.

| Check | Expected result |
|---|---|
| Login and navigation | Lion logo is visible on login, expanded/collapsed sidebar, and mobile navigation. Light/dark wordmarks remain legible. |
| Help Center | The one-minute video plays after clicking Play; audio, captions/fullscreen controls, transcript, and written-guide links work. The clip is about 9 MB and has no autoplay/preload. |
| Client Team | An authorized manager can save a primary Video Editor and a different optional backup. Supervisors may be selected as producers without changing their account role. |
| Content/import | Video rows can use the chosen primary, backup, or self. Static rows keep their selected creator. Importing content creates no task automatically. |
| Video task creation | Add task offers the eligible producer choices and Unassigned. Unassigned stays in To do; only the assigned producer can progress assigned work. |
| Reassignment | Reassign an accessible active video task with a reason. It returns to To do; files/history remain; old/new owners receive their assignment notices when present. Pending review/approval tasks cannot be transferred. |
| Default-editor change | Changing the client's default does not move an existing task or strand its current producer's active work. |
| Supervisor production | An explicitly assigned Supervisor can start, upload, and submit content-linked static/video work. Their own review is blocked; another Supervisor or Administrator can review it. |
| Client approval/scheduling | Internal approval waits for the external client decision. Record the external handoff/approval and set the posting schedule. Publication is still performed outside Jota, then marked Published. |
| Notifications and files | Check the bell, opted-in email, desktop alert, and a permitted Drive preview/download/upload. New notifications should use the lion icon. |

The notification service worker normally updates on a subsequent visit; a tab refresh/reopen may be needed before its icon changes. A cached favicon may also take a refresh to update. Do not rotate working push keys or disconnect Drive to refresh branding.

Actual email, desktop delivery, and Drive operations still need these live checks. Automated tests prove database queueing, permissions, and history preservation, not delivery through the configured external services. Confirm the separate staging site and other VPS applications remain available.

## Rollback if the application fails

Use the **previous full commit and image tag saved in Phase 1**. Replace the two quoted placeholders before running:

```sh
cd /opt/jota-production &&
git switch --detach "PASTE_PREVIOUS_FULL_COMMIT" &&
export JOTA_RELEASE="PASTE_PREVIOUS_IMAGE_TAG" &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml up -d --no-build --wait --wait-timeout 180 web &&
docker compose --env-file /etc/jota-production/app.env \
  -f deploy/vps/compose.production.yaml ps
```

Repeat the Phase 4 login checks; the old image will not contain the new lion icon URL. Keep the current production environment and retained previous image. If that image is unavailable, stop and assess recovery instead of rebuilding an arbitrary release or restoring old credentials.

Leave the additive migrations installed. An old app does not display backup/reassignment controls, and its direct-completion option for content-linked Supervisor work may now be rejected by the independent-review rule. A forward fix is preferred if that workflow is needed. Do not restore the old review-bypass database function, delete backup memberships/history, or remove the enum/review flag as an automatic rollback.

This guide does not deploy to Vercel, reconfigure the separate staging database, or perform the VPS deployment automatically.

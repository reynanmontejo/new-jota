# Jota staging on the Hostinger VPS

This deployment is isolated from the production Vercel application. The VPS
already hosts other services and uses ports 80 and 443 through Nginx. Jota's
container binds only to `127.0.0.1:3102`; Nginx serves the staging hostname.

## Required environment

Create a separate Supabase project for staging, apply the migrations in
`supabase/migrations` in filename order, and use test accounts and synthetic
data. Do not point this deployment at the production Supabase project.

Store its environment at `/etc/jota-staging/app.env` on the VPS, owned by root
with mode `0600`. Never commit or copy production secrets into this file.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The two `NEXT_PUBLIC_` values are also passed as Docker build arguments because
Next.js embeds them in the browser bundle at build time. Server-only secrets
remain runtime environment variables. Google Drive and browser push are
optional for the first core-workflow check; configure separate staging OAuth,
Vault, and push values before testing those integrations.

## Build and run

From `/opt/jota-staging` on the VPS:

```sh
docker compose --env-file /etc/jota-staging/app.env \
  -f deploy/vps/compose.yaml up -d --build
docker ps --filter name=jota-staging
curl -I http://127.0.0.1:3102/login
```

Serve `jota-staging.joynoadmin.tech` through a separate Nginx site with HTTPS,
proxying to `http://127.0.0.1:3102`. Leave existing Nginx sites and Docker
containers intact. The VPS's `srv1981649.hstgr.cloud` hostname already serves
the Joyno HR application and must not be repointed to Jota.

For a rollout, pull the intended commit, rebuild this Compose project, and
verify the container health and the HTTPS login page. If the rollout fails,
check out the previous commit and rebuild only `jota-staging`. The production
Vercel deployment is unaffected.

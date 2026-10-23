# Jota — Joyno Task

Jota is a private marketing-operations workspace for managing client accounts,
tasks, social content, reviews, and client files. It is built with Next.js,
TypeScript, Tailwind CSS, and Supabase. Google Drive is used as the private file
provider when configured.

## What the system does

- **Clients:** organize client workspaces, social platforms, and Account Manager
  ownership. Account Managers can create clients; Supervisors and Administrators
  can oversee and assign Account Managers.
- **Tasks:** plan and assign operational work, track status, dates, checklists,
  comments, activity, and attached work files. Assigned work can be submitted as
  versioned task review; Supervisors can approve it or request revisions. A
  completed task can be archived separately from Trash, preserving its files and
  review history.
- **Content tracker:** manage one content item per piece of work, including its
  client, campaign, platform, format, dates, owner, status, revision notes, and
  next action. Content items do not automatically create tasks.
- **CSV import:** preview and import up to 250 content rows per file. The
  importer recognizes the social-calendar layout documented below.
- **Calendar:** see content publish dates and deadlines alongside task due dates;
  select a date to view its items.
- **Content review:** attach files to content items, submit immutable versions,
  and let Supervisors approve or request changes with feedback.
- **Review separation:** task submissions and content submissions have their
  own review histories. A task approval does not publish content, and content
  approval does not complete a task.
- **Private files:** upload and access client, task, and content files through
  the app. Google Drive files are not made public. The Clients → Files view also
  shows recent accessible uploads.
- **Employees and access:** Administrators can manage employee accounts and
  roles. Accounts can be deactivated or moved to Trash, with restoration during
  the configured retention period.
- **Notifications:** persist task assignment, submission/review, comment, and
  due-date alerts. Sound and email are optional; email uses the setup in
  [Email notifications](docs/email-notification-setup.md). Browser push remains
  opt-in and has separate server setup in [Notifications](docs/notifications-setup.md).

## Roles at a glance

- **Account Manager:** manages assigned client work, creates clients, updates
  content, uploads work, and submits content for review.
- **Supervisor:** oversees organization-wide client/task progress, assigns
  Account Managers, and reviews submitted task work and content.
- **Administrator:** manages the organization, employee access, and storage
  settings in addition to supervisory access.

Access is enforced by Supabase authentication, organization membership, role
permissions, and row-level security—not by hiding or showing UI controls alone.

## Requirements

- Node.js and npm compatible with the versions declared by this project’s
  Next.js dependencies.
- A Supabase project for authenticated, persistent use.
- Optional: Supabase CLI and Docker for local Supabase development.
- Optional: a Google Cloud OAuth Web application and Google Drive API for file
  storage. See [Google Drive setup](docs/google-drive-setup.md).

## Run locally

From the repository root:

```bash
npm ci
```

If `.env.local` does not already exist, copy `.env.example` to `.env.local`
from PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS/Linux, use `cp .env.example .env.local`. If `.env.local` already
exists, open and edit it instead of overwriting it. Add your Supabase project
URL and publishable key. The
service key is required for trusted server-side employee administration; keep
it private and do not add a `NEXT_PUBLIC_` prefix. See
[Supabase environment setup](docs/supabase-environment-setup.md) for details.

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If Supabase is not
configured, local development uses the demo workspace and its role switch; demo
changes are not saved to a Supabase database. With Supabase configured, users
must sign in. Public sign-up is disabled; create accounts through Supabase Auth
or Jota’s employee administration. The first administrator completes the
one-time setup at `/setup` when the database is empty.

## Database setup and migrations

Schema changes are versioned in [`supabase/migrations`](supabase/migrations).
The app does not apply migrations automatically.

For a **local Supabase database**, install the Supabase CLI and run:

```bash
supabase start
supabase db reset
```

`supabase db reset` recreates the **local** database and applies migrations and
the seed. Do not run it against a hosted or production project.

For an existing hosted project, first check which migrations and database
objects are already present. Apply only missing migrations, in timestamp order,
using an appropriately privileged database role. Never replay migrations or
repair migration history blindly. Review
[the database schema guide](docs/database-schema.md) and
[the Supabase environment guide](docs/supabase-environment-setup.md) before
changing a hosted database.

The development seed creates example organization data but does not create
Supabase Auth users. Sign-in accounts and their profile/role memberships are
managed separately.

## Google Drive file storage

Google Drive configuration is optional for running the app, but required for
the private upload/download workflows. The integration uses the approved
storage account `joynojohn@gmail.com`; OAuth credentials and a 32-byte token
encryption key belong in the server-only `.env.local` variables documented in
[Google Drive setup](docs/google-drive-setup.md). Restart the dev server after
editing environment variables. Apply the Drive storage migration before
connecting the account to a hosted database.

The app accepts common image, video, document, CSV, and presentation files up
to 100 MB. Browser uploads use private 4 MiB resumable chunks so each request
stays below Vercel's request limit; Google Drive session URLs remain encrypted
on the server. Verify an end-to-end upload and download of a file larger than
4.5 MB on the target deployment before relying on large videos in production.
Uploads are private and are not automatically deleted from Drive when metadata
is archived in Jota.

## Importing a social content calendar

Use a comma-separated `.csv` file (not `.xlsx` or PDF), with one header row and
up to 250 content rows. The recognized social-calendar columns are:

```csv
Date,Day,Status,Type/Focus,Content Idea,Format
2026-09-19,Sat,Task completed,Resort,"Why choose Shark's Tail for your next dive trip?",Carousel
2026-09-21,Mon,In progress,Dive Center,"What to expect on your first guided dive",Reel
```

`Date`, `Type/Focus`, `Content Idea`, and `Format` are the key columns; `Day` is
optional. Choose the client, campaign, and platform once in the importer, unless
those values are included as mapped columns. The source `Status` is preserved
as a note for this calendar format; imported items start as **Planned**. The CSV
creates content tracker entries, not tasks or file attachments. Upload completed
assets to the content items after import.

## Main pages

| Page | Purpose |
| --- | --- |
| `/` | Workspace overview |
| `/clients` | Client directory and assignments |
| `/clients?tab=files` | Recent files and links to client file libraries |
| `/clients/[clientId]` | A client’s workspace: overview, files, team, tasks, campaigns, and activity |
| `/tasks` | Task board/list and task details |
| `/tasks/archive` | Restore completed tasks archived from the board |
| `/tasks/trash` | Restore tasks moved to Trash |
| `/content` | Content tracker and CSV import |
| `/calendar` | Content dates and task deadlines |
| `/reviews` | Supervisor queues for task and content submissions |
| `/employees` | Administrator employee and role management |
| `/settings/storage` | Administrator Google Drive connection and file management |
| `/settings` | Personal sound, email, and browser push notification preferences |
| `/profile` | Personal display name, job title, and avatar URL |
| `/help` | Role-oriented guides for the main Jota workflows |

## Workflow boundaries and current limitations

Task and content review are both persistent workflows with numbered submissions,
supervisor decisions, and revision history. Uploading a file alone does not
submit it: select the files and submit them for review. Keep marketing-content
approval in the content item's review flow and operational task approval in the
task review flow.

Global search currently covers tasks, clients, and campaigns; content and files
are not included. Filtered content export is not currently available. CSV import
creates content tracker items, not tasks or file attachments; add a linked task
only when the work needs its own task owner, progress, and due date.

## Quality checks

Run these from the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run test:schema
npm run build
```

`npm run test:schema` discovers every committed migration, applies all 38 files
in filename order to a clean PGlite database, and then runs the populated
workflow/RLS regression suite. Hosted-only Auth, Storage, Realtime, Cron, Vault,
and `pg_net` behavior is mocked or excluded, so this check still does not prove
that a hosted Supabase project matches the repository.

The same lint, typecheck, unit, schema, and production-build commands run in the
GitHub Actions release gate for pushes to `master` and pull requests.

## Security notes

- Never commit `.env.local`, OAuth client secrets, Supabase secret keys, or the
  Drive token-encryption key.
- Never expose server secrets through `NEXT_PUBLIC_*` variables or client code.
- Do not create public Google Drive links for client files.
- Keep hosted database changes separate from local testing; inspect and verify
  migration state before applying SQL.

## Further documentation

- [Supabase environment setup](docs/supabase-environment-setup.md)
- [Google Drive setup](docs/google-drive-setup.md)
- [Database schema and security](docs/database-schema.md)
- [Remaining implementation plan](docs/remaining-phases-implementation-plan.md)
- [Account Manager content workflow plan](docs/account-manager-content-workflow-plan.md)

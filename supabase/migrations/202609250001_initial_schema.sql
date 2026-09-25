begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.employee_status as enum ('invited', 'active', 'inactive');
create type public.client_status as enum ('active', 'paused', 'archived');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed', 'cancelled');
create type public.content_status as enum ('idea', 'planned', 'in_production', 'scheduled', 'published', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'for_review', 'revision_requested', 'approved', 'completed', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.client_member_role as enum ('supervisor', 'account_manager', 'designer', 'copywriter', 'video_editor');
create type public.submission_status as enum ('draft', 'submitted', 'revision_requested', 'approved');
create type public.review_decision as enum ('approved', 'revision_requested');
create type public.storage_provider as enum ('google_drive');
create type public.meeting_status as enum ('requested', 'scheduled', 'completed', 'cancelled');
create type public.notification_type as enum (
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'submitted_for_review',
  'revision_requested',
  'submission_approved',
  'comment_added',
  'meeting_requested'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug citext not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email citext not null,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  avatar_url text,
  job_title text,
  status public.employee_status not null default 'invited',
  last_seen_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, email),
  check ((status = 'inactive') = (deactivated_at is not null))
);

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code citext not null check (code ~ '^[a-z_]+$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.role_permissions (
  organization_id uuid not null,
  role_id uuid not null,
  permission_code text not null references public.permissions(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code),
  foreign key (organization_id, role_id) references public.roles(organization_id, id) on delete cascade
);

create table public.user_roles (
  organization_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  primary key (user_id, role_id),
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete cascade,
  foreign key (organization_id, role_id) references public.roles(organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_by) references public.profiles(organization_id, id) on delete restrict
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id)
);

create unique index teams_organization_name_active_idx
  on public.teams (organization_id, lower(name)) where deleted_at is null;

create table public.team_members (
  organization_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  is_lead boolean not null default false,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (team_id, user_id),
  foreign key (organization_id, team_id) references public.teams(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete restrict
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 140),
  slug citext not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  website_url text,
  status public.client_status not null default 'active',
  drive_folder_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, slug),
  foreign key (organization_id, created_by) references public.profiles(organization_id, id) on delete restrict
);

create table public.client_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  user_id uuid not null,
  client_role public.client_member_role not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  removed_at timestamptz,
  unique (organization_id, id),
  unique (client_id, user_id, client_role),
  foreign key (organization_id, client_id) references public.clients(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, assigned_by) references public.profiles(organization_id, id) on delete restrict,
  check (not is_primary or client_role = 'account_manager')
);

create unique index client_members_one_primary_account_manager_idx
  on public.client_members (client_id)
  where is_primary and client_role = 'account_manager' and removed_at is null;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  status public.campaign_status not null default 'draft',
  start_date date,
  end_date date,
  drive_folder_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, client_id, id),
  foreign key (organization_id, client_id) references public.clients(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by) references public.profiles(organization_id, id) on delete restrict,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index campaigns_client_status_idx on public.campaigns (client_id, status) where deleted_at is null;

create table public.campaign_members (
  organization_id uuid not null,
  campaign_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (campaign_id, user_id),
  foreign key (organization_id, campaign_id) references public.campaigns(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete restrict
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  campaign_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text,
  platform text not null check (char_length(trim(platform)) between 2 and 60),
  content_type text not null check (char_length(trim(content_type)) between 2 and 80),
  status public.content_status not null default 'idea',
  publish_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, client_id, campaign_id, id),
  foreign key (organization_id, client_id, campaign_id) references public.campaigns(organization_id, client_id, id) on delete cascade,
  foreign key (organization_id, created_by) references public.profiles(organization_id, id) on delete restrict
);

create index content_items_publish_at_idx
  on public.content_items (organization_id, publish_at) where deleted_at is null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  campaign_id uuid,
  content_item_id uuid,
  title text not null check (char_length(trim(title)) between 2 and 220),
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  start_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, client_id, id),
  foreign key (organization_id, client_id) references public.clients(organization_id, id) on delete cascade,
  foreign key (organization_id, client_id, campaign_id) references public.campaigns(organization_id, client_id, id) on delete restrict,
  foreign key (organization_id, client_id, campaign_id, content_item_id) references public.content_items(organization_id, client_id, campaign_id, id) on delete restrict,
  foreign key (organization_id, created_by) references public.profiles(organization_id, id) on delete restrict,
  check (due_at is null or start_at is null or due_at >= start_at),
  check ((status = 'completed') = (completed_at is not null)),
  check (content_item_id is null or campaign_id is not null)
);

create index tasks_client_status_due_idx on public.tasks (client_id, status, due_at) where deleted_at is null;
create index tasks_organization_due_idx on public.tasks (organization_id, due_at) where deleted_at is null;

create table public.task_assignees (
  organization_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  removed_at timestamptz,
  primary key (task_id, user_id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, assigned_by) references public.profiles(organization_id, id) on delete restrict
);

create unique index task_assignees_one_primary_idx
  on public.task_assignees (task_id) where is_primary and removed_at is null;
create index task_assignees_user_active_idx
  on public.task_assignees (user_id, task_id) where removed_at is null;

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  position integer not null default 0 check (position >= 0),
  is_completed boolean not null default false,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (task_id, position),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade,
  foreign key (organization_id, completed_by) references public.profiles(organization_id, id) on delete restrict,
  check ((is_completed and completed_at is not null and completed_by is not null) or (not is_completed and completed_at is null and completed_by is null))
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  author_id uuid not null,
  parent_comment_id uuid,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, task_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade,
  foreign key (organization_id, author_id) references public.profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, task_id, parent_comment_id) references public.comments(organization_id, task_id, id) on delete cascade
);

create index comments_task_created_idx on public.comments (task_id, created_at) where deleted_at is null;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  campaign_id uuid,
  task_id uuid,
  storage_provider public.storage_provider not null default 'google_drive',
  provider_file_id text not null,
  provider_folder_id text,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, task_id, id),
  unique (organization_id, storage_provider, provider_file_id),
  foreign key (organization_id, client_id) references public.clients(organization_id, id) on delete cascade,
  foreign key (organization_id, client_id, campaign_id) references public.campaigns(organization_id, client_id, id) on delete restrict,
  foreign key (organization_id, client_id, task_id) references public.tasks(organization_id, client_id, id) on delete restrict,
  foreign key (organization_id, uploaded_by) references public.profiles(organization_id, id) on delete restrict
);

create index attachments_task_created_idx on public.attachments (task_id, created_at) where deleted_at is null;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  status public.submission_status not null default 'draft',
  current_version_number integer not null default 0 check (current_version_number >= 0),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (task_id),
  unique (organization_id, task_id, id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade,
  foreign key (organization_id, submitted_by) references public.profiles(organization_id, id) on delete restrict,
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)),
  check ((status = 'approved') = (approved_at is not null))
);

create table public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  submission_id uuid not null,
  version_number integer not null check (version_number > 0),
  notes text,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, task_id, id),
  unique (submission_id, version_number),
  foreign key (organization_id, task_id, submission_id) references public.submissions(organization_id, task_id, id) on delete cascade,
  foreign key (organization_id, submitted_by) references public.profiles(organization_id, id) on delete restrict
);

create table public.submission_version_files (
  organization_id uuid not null,
  task_id uuid not null,
  submission_version_id uuid not null,
  attachment_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (submission_version_id, attachment_id),
  foreign key (organization_id, task_id, submission_version_id) references public.submission_versions(organization_id, task_id, id) on delete cascade,
  foreign key (organization_id, task_id, attachment_id) references public.attachments(organization_id, task_id, id) on delete restrict
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_version_id uuid not null,
  reviewer_id uuid not null,
  decision public.review_decision not null,
  comment text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (submission_version_id),
  foreign key (organization_id, submission_version_id) references public.submission_versions(organization_id, id) on delete restrict,
  foreign key (organization_id, reviewer_id) references public.profiles(organization_id, id) on delete restrict,
  check (decision <> 'revision_requested' or char_length(trim(comment)) > 0)
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  url text not null,
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_tools (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  is_enabled boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (organization_id, tool_id)
);

create table public.user_tools (
  organization_id uuid not null,
  user_id uuid not null,
  tool_id uuid not null references public.tools(id) on delete cascade,
  is_pinned boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id),
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete cascade,
  foreign key (organization_id, tool_id) references public.organization_tools(organization_id, tool_id) on delete cascade
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid,
  requested_by uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text,
  status public.meeting_status not null default 'requested',
  starts_at timestamptz,
  ends_at timestamptz,
  meeting_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients(organization_id, id) on delete restrict,
  foreign key (organization_id, requested_by) references public.profiles(organization_id, id) on delete restrict,
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.meeting_participants (
  organization_id uuid not null,
  meeting_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  foreign key (organization_id, meeting_id) references public.meetings(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete restrict
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  recipient_id uuid not null,
  type public.notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, recipient_id) references public.profiles(organization_id, id) on delete cascade
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action ~ '^[A-Z][A-Z0-9_]+$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, actor_id) references public.profiles(organization_id, id) on delete restrict
);

create index activity_logs_entity_idx on public.activity_logs (organization_id, entity_type, entity_id, created_at desc);
create index activity_logs_actor_idx on public.activity_logs (actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_immutable_record_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger content_items_set_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger checklist_set_updated_at before update on public.task_checklist_items
  for each row execute function public.set_updated_at();
create trigger comments_set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();
create trigger submissions_set_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
create trigger tools_set_updated_at before update on public.tools
  for each row execute function public.set_updated_at();
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create trigger submission_versions_are_immutable
  before update or delete on public.submission_versions
  for each row execute function public.prevent_immutable_record_changes();
create trigger reviews_are_immutable
  before update or delete on public.reviews
  for each row execute function public.prevent_immutable_record_changes();
create trigger activity_logs_are_immutable
  before update or delete on public.activity_logs
  for each row execute function public.prevent_immutable_record_changes();

insert into public.permissions (code, description) values
  ('clients.view_assigned', 'View clients assigned to the current user'),
  ('clients.view_all', 'View all clients in the permitted organization scope'),
  ('clients.manage', 'Create and update clients and client assignments'),
  ('campaigns.create', 'Create campaigns'),
  ('campaigns.update', 'Update campaigns'),
  ('campaigns.delete', 'Archive campaigns'),
  ('content.create', 'Create content items'),
  ('content.update', 'Update content items'),
  ('tasks.create', 'Create tasks'),
  ('tasks.update', 'Update tasks'),
  ('tasks.assign', 'Assign task owners and collaborators'),
  ('tasks.review', 'Review submitted task output'),
  ('tasks.approve', 'Approve submitted task output'),
  ('employees.view', 'View employees'),
  ('employees.create', 'Invite and create employees'),
  ('employees.update', 'Update employee profiles and roles'),
  ('employees.deactivate', 'Deactivate employees'),
  ('teams.manage', 'Create and manage teams'),
  ('tools.manage', 'Manage organization tools'),
  ('storage.manage', 'Manage storage configuration'),
  ('settings.manage', 'Manage organization settings')
on conflict (code) do update set description = excluded.description;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.content_items enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.submission_version_files enable row level security;
alter table public.reviews enable row level security;
alter table public.tools enable row level security;
alter table public.organization_tools enable row level security;
alter table public.user_tools enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

commit;

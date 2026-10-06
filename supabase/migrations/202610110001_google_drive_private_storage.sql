begin;

-- OAuth refresh tokens are encrypted by the application before persistence.
-- These tables are service-role-only: browser users must never read provider
-- credentials or folder mappings directly.
create table public.google_drive_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  google_email citext not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_tag text not null,
  root_folder_id text,
  connected_by uuid not null references public.profiles(id) on delete restrict,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_drive_folders (
  organization_id uuid not null,
  client_id uuid not null,
  provider_folder_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, client_id),
  unique (organization_id, provider_folder_id),
  foreign key (organization_id, client_id)
    references public.clients(organization_id, id) on delete cascade
);

alter table public.google_drive_connections enable row level security;
alter table public.client_drive_folders enable row level security;
revoke all on public.google_drive_connections, public.client_drive_folders from public, anon, authenticated;
grant all on public.google_drive_connections, public.client_drive_folders to service_role;

commit;

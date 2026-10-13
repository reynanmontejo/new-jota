begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_public_read on storage.objects;
create policy profile_avatars_public_read on storage.objects for select to public
  using (bucket_id = 'profile-avatars');

drop policy if exists profile_avatars_upload_own on storage.objects;
create policy profile_avatars_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatars_delete_own on storage.objects;
create policy profile_avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.password_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'completed')),
  request_note text check (char_length(coalesce(request_note, '')) <= 500),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (char_length(coalesce(decision_note, '')) <= 500),
  completed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete cascade,
  foreign key (organization_id, decided_by) references public.profiles(organization_id, id) on delete restrict,
  check (
    (status = 'pending' and decided_by is null and decided_at is null and completed_at is null)
    or (status in ('approved', 'rejected') and decided_by is not null and decided_at is not null and completed_at is null)
    or (status = 'completed' and decided_by is not null and decided_at is not null and completed_at is not null)
  )
);

create unique index password_change_requests_one_open_per_user
  on public.password_change_requests (organization_id, user_id)
  where status in ('pending', 'approved');
create index password_change_requests_org_status_requested_idx
  on public.password_change_requests (organization_id, status, requested_at desc);

alter table public.password_change_requests enable row level security;
revoke all on public.password_change_requests from public, anon, authenticated;
grant all on public.password_change_requests to service_role;

alter type public.notification_type add value if not exists 'password_change_requested';
alter type public.notification_type add value if not exists 'password_change_request_decided';

commit;

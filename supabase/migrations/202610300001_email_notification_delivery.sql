begin;

alter table public.notification_preferences
  add column if not exists email_enabled boolean not null default false;

create table if not exists public.notification_email_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  recipient_id uuid not null,
  notification_id uuid not null unique,
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  processed_at timestamptz,
  last_error text,
  foreign key (organization_id, notification_id)
    references public.notifications(organization_id, id) on delete cascade,
  foreign key (organization_id, recipient_id)
    references public.profiles(organization_id, id) on delete cascade
);
create index if not exists notification_email_queue_pending_idx
  on public.notification_email_queue (next_attempt_at, created_at)
  where processed_at is null;
alter table public.notification_email_queue enable row level security;
revoke all on public.notification_email_queue from public, anon, authenticated;
grant select, insert, update, delete on public.notification_email_queue to service_role;

create or replace function private.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.notification_preferences preference
    join public.profiles profile
      on profile.organization_id = preference.organization_id
      and profile.id = preference.user_id
    where preference.organization_id = new.organization_id
      and preference.user_id = new.recipient_id
      and preference.email_enabled
      and profile.status = 'active'
      and profile.deactivated_at is null
  ) then
    insert into public.notification_email_queue (organization_id, recipient_id, notification_id)
    values (new.organization_id, new.recipient_id, new.id)
    on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_notification_email() from public, anon, authenticated;
drop trigger if exists notification_email_queue_insert on public.notifications;
create trigger notification_email_queue_insert
  after insert on public.notifications
  for each row execute function private.queue_notification_email();

create or replace function public.set_notification_email_preference_for_current_user(p_email_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  insert into public.notification_preferences (organization_id, user_id, email_enabled, updated_at)
  values (org_id, actor_id, coalesce(p_email_enabled, false), now())
  on conflict (organization_id, user_id) do update
    set email_enabled = excluded.email_enabled, updated_at = now();

  if not coalesce(p_email_enabled, false) then
    update public.notification_email_queue
    set processed_at = now(), lease_until = null, last_error = 'Email alerts disabled by recipient'
    where organization_id = org_id and recipient_id = actor_id and processed_at is null;
  end if;
end;
$$;

create or replace function public.claim_notification_email_batch(p_limit integer default 10)
returns table (
  queue_id uuid,
  notification_id uuid,
  recipient_id uuid,
  recipient_email text,
  title text,
  body text,
  href text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 25 then
    raise exception 'Batch size must be between 1 and 25' using errcode = '22023';
  end if;

  -- Do not leave work queued for users who opted out or are no longer active.
  update public.notification_email_queue queue
  set processed_at = now(), lease_until = null,
      last_error = 'Recipient is inactive or email alerts are disabled'
  where queue.processed_at is null
    and (queue.lease_until is null or queue.lease_until < now())
    and not exists (
      select 1
      from public.notification_preferences preference
      join public.profiles profile
        on profile.organization_id = preference.organization_id
        and profile.id = preference.user_id
      where preference.organization_id = queue.organization_id
        and preference.user_id = queue.recipient_id
        and preference.email_enabled
        and profile.status = 'active'
        and profile.deactivated_at is null
    );

  return query
  with picked as (
    select queue.id
    from public.notification_email_queue queue
    join public.notification_preferences preference
      on preference.organization_id = queue.organization_id
      and preference.user_id = queue.recipient_id
      and preference.email_enabled
    join public.profiles profile
      on profile.organization_id = queue.organization_id
      and profile.id = queue.recipient_id
      and profile.status = 'active'
      and profile.deactivated_at is null
    where queue.processed_at is null
      and queue.attempts < 5
      and queue.next_attempt_at <= now()
      and (queue.lease_until is null or queue.lease_until < now())
      and profile.email is not null
    order by queue.created_at
    limit p_limit
    for update of queue skip locked
  ), claimed as (
    update public.notification_email_queue queue
    set lease_until = now() + interval '10 minutes',
        attempts = queue.attempts + 1
    from picked
    where queue.id = picked.id
    returning queue.id, queue.organization_id, queue.recipient_id, queue.notification_id, queue.attempts
  )
  select claimed.id, notification.id, claimed.recipient_id, profile.email::text,
         notification.title, notification.body, notification.href, claimed.attempts
  from claimed
  join public.notifications notification
    on notification.organization_id = claimed.organization_id
    and notification.id = claimed.notification_id
  join public.profiles profile
    on profile.organization_id = claimed.organization_id
    and profile.id = claimed.recipient_id;
end;
$$;

create or replace function public.finish_notification_email_attempt(
  p_queue_id uuid, p_success boolean, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_email_queue queue
  set processed_at = case when p_success or queue.attempts >= 5 then now() else null end,
      next_attempt_at = case when p_success or queue.attempts >= 5 then queue.next_attempt_at
        else now() + make_interval(mins => least(60, (5 * power(2, queue.attempts - 1))::integer)) end,
      lease_until = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Email delivery failed'), 500) end
  where queue.id = p_queue_id and queue.processed_at is null;
end;
$$;

revoke all on function public.set_notification_email_preference_for_current_user(boolean) from public, anon;
revoke all on function public.claim_notification_email_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_email_attempt(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_notification_email_preference_for_current_user(boolean) to authenticated;
grant execute on function public.claim_notification_email_batch(integer) to service_role;
grant execute on function public.finish_notification_email_attempt(uuid, boolean, text) to service_role;

commit;

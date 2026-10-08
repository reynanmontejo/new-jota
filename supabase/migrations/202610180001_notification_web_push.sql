begin;

alter table public.notification_preferences
  add column if not exists push_enabled boolean not null default false;

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  endpoint text not null check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 16 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint),
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete cascade
);
alter table public.notification_push_subscriptions enable row level security;
revoke all on public.notification_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.notification_push_subscriptions to service_role;

create table if not exists public.notification_push_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  recipient_id uuid not null,
  notification_id uuid not null unique,
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  processed_at timestamptz,
  last_error text,
  foreign key (organization_id, notification_id) references public.notifications(organization_id, id) on delete cascade,
  foreign key (organization_id, recipient_id) references public.profiles(organization_id, id) on delete cascade
);
create index if not exists notification_push_queue_pending_idx
  on public.notification_push_queue (created_at) where processed_at is null;
alter table public.notification_push_queue enable row level security;
revoke all on public.notification_push_queue from public, anon, authenticated;
grant select, insert, update, delete on public.notification_push_queue to service_role;

create or replace function private.enqueue_notification(
  p_organization_id uuid, p_recipient_id uuid, p_type public.notification_type,
  p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_href text, p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_notification_id uuid;
begin
  if p_recipient_id is null or p_dedupe_key is null or trim(p_dedupe_key) = '' then return; end if;
  insert into public.notifications (
    organization_id, recipient_id, type, title, body, entity_type, entity_id, href, dedupe_key
  ) values (
    p_organization_id, p_recipient_id, p_type, left(trim(p_title), 180), nullif(trim(coalesce(p_body, '')), ''),
    p_entity_type, p_entity_id, p_href, p_dedupe_key
  ) on conflict (organization_id, recipient_id, dedupe_key) do nothing
  returning id into new_notification_id;

  if new_notification_id is not null and exists (
    select 1 from public.notification_preferences preference
    where preference.organization_id = p_organization_id and preference.user_id = p_recipient_id
      and preference.push_enabled
  ) and exists (
    select 1 from public.notification_push_subscriptions subscription
    where subscription.organization_id = p_organization_id and subscription.user_id = p_recipient_id
  ) then
    insert into public.notification_push_queue (organization_id, recipient_id, notification_id)
    values (p_organization_id, p_recipient_id, new_notification_id)
    on conflict (notification_id) do nothing;
  end if;
end;
$$;

create or replace function public.register_notification_push_subscription_for_current_user(
  p_endpoint text, p_p256dh text, p_auth text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|web\.push\.apple\.com)(/|$)'
    or char_length(p_endpoint) > 2048
    or char_length(coalesce(p_p256dh, '')) not between 40 and 200
    or char_length(coalesce(p_auth, '')) not between 16 and 100 then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;
  insert into public.notification_push_subscriptions (organization_id, user_id, endpoint, p256dh, auth, updated_at)
  values (org_id, actor_id, p_endpoint, p_p256dh, p_auth, now())
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  insert into public.notification_preferences (organization_id, user_id, push_enabled, updated_at)
  values (org_id, actor_id, true, now())
  on conflict (organization_id, user_id) do update
    set push_enabled = true, updated_at = now();
end;
$$;

create or replace function public.remove_notification_push_subscription_for_current_user(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  delete from public.notification_push_subscriptions
  where organization_id = org_id and user_id = actor_id and endpoint = p_endpoint;
  if not exists (
    select 1 from public.notification_push_subscriptions
    where organization_id = org_id and user_id = actor_id
  ) then
    insert into public.notification_preferences (organization_id, user_id, push_enabled, updated_at)
    values (org_id, actor_id, false, now())
    on conflict (organization_id, user_id) do update
      set push_enabled = false, updated_at = now();
  end if;
end;
$$;

create or replace function public.claim_notification_push_batch(p_limit integer default 50)
returns table (
  queue_id uuid, notification_id uuid, recipient_id uuid, title text, body text, href text,
  attempts integer, subscriptions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'Batch size must be between 1 and 100' using errcode = '22023'; end if;
  return query
  with picked as (
    select queue.id from public.notification_push_queue queue
    where queue.processed_at is null and (queue.lease_until is null or queue.lease_until < now())
    order by queue.created_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_push_queue queue
    set lease_until = now() + interval '5 minutes', attempts = queue.attempts + 1
    from picked where queue.id = picked.id
    returning queue.id, queue.organization_id, queue.recipient_id, queue.notification_id, queue.attempts
  )
  select claimed.id, notification.id, notification.recipient_id, notification.title, notification.body,
    notification.href, claimed.attempts,
    coalesce(jsonb_agg(jsonb_build_object('endpoint', subscription.endpoint, 'p256dh', subscription.p256dh, 'auth', subscription.auth))
      filter (where subscription.id is not null), '[]'::jsonb)
  from claimed
  join public.notifications notification on notification.organization_id = claimed.organization_id and notification.id = claimed.notification_id
  left join public.notification_preferences preference on preference.organization_id = claimed.organization_id
    and preference.user_id = claimed.recipient_id and preference.push_enabled
  left join public.notification_push_subscriptions subscription on subscription.organization_id = claimed.organization_id
    and subscription.user_id = claimed.recipient_id and preference.user_id is not null
  group by claimed.id, notification.id, notification.recipient_id, notification.title, notification.body, notification.href, claimed.attempts;
end;
$$;

create or replace function public.finish_notification_push_attempt(p_queue_id uuid, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_push_queue queue
  set processed_at = case when p_success or queue.attempts >= 5 then now() else null end,
      lease_until = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Push delivery failed'), 500) end
  where queue.id = p_queue_id and queue.processed_at is null;
end;
$$;

revoke all on function public.register_notification_push_subscription_for_current_user(text, text, text) from public, anon;
revoke all on function public.remove_notification_push_subscription_for_current_user(text) from public, anon;
revoke all on function public.claim_notification_push_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_push_attempt(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.register_notification_push_subscription_for_current_user(text, text, text) to authenticated;
grant execute on function public.remove_notification_push_subscription_for_current_user(text) to authenticated;
grant execute on function public.claim_notification_push_batch(integer) to service_role;
grant execute on function public.finish_notification_push_attempt(uuid, boolean, text) to service_role;

commit;

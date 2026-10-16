begin;

-- Supabase sends HTTP requests asynchronously through pg_net. The endpoint URL
-- and CRON_SECRET are stored in Supabase Vault and are configured after deploy.
create extension if not exists pg_net with schema net;

create or replace function private.request_notification_push_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  begin
    select
      max(secret.decrypted_secret) filter (where secret.name = 'jota_notification_dispatch_url'),
      max(secret.decrypted_secret) filter (where secret.name = 'jota_notification_dispatch_secret')
    into dispatch_url, dispatch_secret
    from vault.decrypted_secrets secret
    where secret.name in ('jota_notification_dispatch_url', 'jota_notification_dispatch_secret');
  exception when others then
    raise warning 'Notification push dispatch requires Supabase Vault secrets';
    return;
  end;

  if dispatch_url is null or dispatch_secret is null
    or dispatch_url !~ '^https://[^/]+/api/notifications/dispatch/?$'
    or char_length(dispatch_secret) < 16 then
    raise warning 'Notification push dispatch is not configured in Supabase Vault';
    return;
  end if;

  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object('source', 'supabase_notification_queue'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.request_notification_push_dispatch() from public, anon, authenticated;

create or replace function private.dispatch_pending_notification_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notification_push_queue queue
    where queue.processed_at is null
      and (queue.lease_until is null or queue.lease_until < now())
  ) then
    perform private.request_notification_push_dispatch();
  end if;
end;
$$;

revoke all on function private.dispatch_pending_notification_pushes() from public, anon, authenticated;

create or replace function private.trigger_notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.request_notification_push_dispatch();
  return new;
end;
$$;

revoke all on function private.trigger_notification_push_dispatch() from public, anon, authenticated;
drop trigger if exists notification_push_queue_dispatch on public.notification_push_queue;
create trigger notification_push_queue_dispatch
  after insert on public.notification_push_queue
  for each row execute function private.trigger_notification_push_dispatch();

-- The insert trigger provides near-immediate delivery. The five-minute cron
-- job is a recovery path for transient webhook/function/network failures.
select cron.unschedule(jobid)
from cron.job
where jobname = 'dispatch-pending-notification-pushes';

select cron.schedule(
  'dispatch-pending-notification-pushes',
  '*/5 * * * *',
  $$select private.dispatch_pending_notification_pushes();$$
);

commit;

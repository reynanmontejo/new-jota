begin;

-- Additive rollout: existing pages and workflows do not depend on these tables.
-- Roll back the app first. Retain report/note data when disabling the assistant.
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  author_id uuid not null,
  report_date date not null,
  timezone text not null,
  body text not null default '' check (char_length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  recipient_id uuid,
  submitted_at timestamptz,
  revision integer not null default 0,
  notes_revision integer not null default 0,
  body_notes_revision integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, author_id, report_date),
  foreign key (organization_id, author_id) references public.profiles(organization_id, id),
  foreign key (organization_id, recipient_id) references public.profiles(organization_id, id),
  check (recipient_id is null or recipient_id <> author_id),
  check ((status = 'draft' and recipient_id is null and submitted_at is null)
    or (status = 'submitted' and recipient_id is not null and submitted_at is not null))
);
create index if not exists daily_reports_received_idx on public.daily_reports(organization_id, recipient_id, submitted_at desc) where status = 'submitted';

create table if not exists public.daily_report_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  report_id uuid not null,
  request_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, report_id) references public.daily_reports(organization_id, id) on delete cascade,
  unique (report_id, request_id)
);
create index if not exists daily_report_notes_report_idx on public.daily_report_notes(report_id, created_at);

alter table public.daily_reports enable row level security;
alter table public.daily_report_notes enable row level security;
revoke all on public.daily_reports, public.daily_report_notes from anon, authenticated;
grant select on public.daily_reports, public.daily_report_notes to authenticated;
drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated using (
  organization_id = private.current_organization_id()
  and (author_id = auth.uid() or (status = 'submitted' and recipient_id = auth.uid()))
);
drop policy if exists daily_report_notes_read on public.daily_report_notes;
create policy daily_report_notes_read on public.daily_report_notes for select to authenticated using (
  organization_id = private.current_organization_id() and exists (
    select 1 from public.daily_reports r where r.id = daily_report_notes.report_id and r.organization_id = daily_report_notes.organization_id and r.author_id = auth.uid()
  )
);

create or replace function private.lock_own_daily_report(p_date date)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare org uuid := private.current_organization_id(); zone text; report public.daily_reports;
begin
  if org is null then raise exception 'Active account required' using errcode = '42501'; end if;
  select o.timezone into zone from public.organizations o where o.id = org;
  if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then zone := 'Asia/Manila'; end if;
  if p_date is null or p_date > (now() at time zone zone)::date or p_date < (now() at time zone zone)::date - 365 then
    raise exception 'Choose today or a date within the past year' using errcode = '22023';
  end if;
  insert into public.daily_reports(organization_id, author_id, report_date, timezone)
    values (org, auth.uid(), p_date, zone) on conflict (organization_id, author_id, report_date) do nothing;
  select * into report from public.daily_reports where organization_id = org and author_id = auth.uid() and report_date = p_date for update;
  if report.status <> 'draft' then raise exception 'Submitted reports are locked' using errcode = '23514'; end if;
  return report;
end;
$$;
revoke all on function private.lock_own_daily_report(date) from public, anon, authenticated;

create or replace function public.save_daily_report_note(p_date date, p_body text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report public.daily_reports; note_id uuid; existing_body text;
begin
  if p_body is null or char_length(trim(p_body)) not between 1 and 2000 or p_request_id is null then raise exception 'Invalid update' using errcode = '22023'; end if;
  report := private.lock_own_daily_report(p_date);
  select id, body into note_id, existing_body from public.daily_report_notes where report_id = report.id and request_id = p_request_id;
  if note_id is not null then
    if existing_body <> trim(p_body) then raise exception 'This request already saved a different update' using errcode = '22023'; end if;
    return note_id;
  end if;
  if (select count(*) from public.daily_report_notes where report_id = report.id) >= 100 then raise exception 'Daily update limit reached' using errcode = '22023'; end if;
  insert into public.daily_report_notes(organization_id, report_id, request_id, body)
    values (report.organization_id, report.id, p_request_id, trim(p_body)) returning id into note_id;
  update public.daily_reports set notes_revision = notes_revision + 1, revision = revision + 1, updated_at = now() where id = report.id;
  return note_id;
end;
$$;

create or replace function public.save_daily_report_body(p_date date, p_body text, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report public.daily_reports;
begin
  if p_body is null or char_length(trim(p_body)) not between 1 and 20000 then raise exception 'Invalid report' using errcode = '22023'; end if;
  report := private.lock_own_daily_report(p_date);
  if p_expected_revision is distinct from report.revision then raise exception 'Report changed; reload before saving' using errcode = '40001'; end if;
  update public.daily_reports set body = trim(p_body), body_notes_revision = notes_revision, revision = revision + 1, updated_at = now() where id = report.id;
  return report.id;
end;
$$;

create or replace function public.list_daily_report_supervisors()
returns table (id uuid, display_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name from public.profiles p
  where p.organization_id = private.current_organization_id() and p.id <> auth.uid()
    and p.status = 'active' and p.deactivated_at is null and exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id and r.organization_id = ur.organization_id
      where ur.user_id = p.id and ur.organization_id = p.organization_id and r.code in ('supervisor', 'administrator')
    ) order by p.display_name
$$;

create or replace function public.submit_daily_report(p_date date, p_recipient_id uuid, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report public.daily_reports; author_name text;
begin
  report := private.lock_own_daily_report(p_date);
  if p_expected_revision is distinct from report.revision then raise exception 'Report changed; reload before sending' using errcode = '40001'; end if;
  if nullif(trim(report.body), '') is null or report.body_notes_revision is distinct from report.notes_revision then raise exception 'Save an up-to-date report first' using errcode = '22023'; end if;
  if not exists (select 1 from public.list_daily_report_supervisors() s where s.id = p_recipient_id) then raise exception 'Choose an active supervisor in your workspace' using errcode = '42501'; end if;
  update public.daily_reports set status = 'submitted', recipient_id = p_recipient_id, submitted_at = now(), updated_at = now(), revision = revision + 1 where id = report.id;
  select display_name into author_name from public.profiles where id = auth.uid();
  insert into public.notifications(organization_id, recipient_id, type, title, body, entity_type, entity_id, href, dedupe_key)
    values (report.organization_id, p_recipient_id, 'daily_report_submitted', 'Daily report received',
      author_name || ' submitted their report for ' || p_date::text || '.', 'daily_report', report.id, '/?assistant=reports', 'daily-report:' || report.id::text)
    on conflict do nothing;
  return report.id;
end;
$$;

revoke all on function public.save_daily_report_note(date, text, uuid), public.save_daily_report_body(date, text, integer), public.list_daily_report_supervisors(), public.submit_daily_report(date, uuid, integer) from public, anon;
grant execute on function public.save_daily_report_note(date, text, uuid), public.save_daily_report_body(date, text, integer), public.list_daily_report_supervisors(), public.submit_daily_report(date, uuid, integer) to authenticated;

-- Distributed daily AI request allowance; saving notes and generating reports
-- do not consume it. No messages, report text or credentials are stored here.
create table if not exists private.assistant_request_usage (
  user_id uuid not null references public.profiles(id),
  usage_date date not null,
  requests integer not null default 1,
  primary key (user_id, usage_date)
);
alter table private.assistant_request_usage enable row level security;
revoke all on private.assistant_request_usage from public, anon, authenticated;
create or replace function public.claim_assistant_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed integer;
begin
  if private.current_organization_id() is null then raise exception 'Active account required' using errcode = '42501'; end if;
  delete from private.assistant_request_usage where user_id = auth.uid() and usage_date < (now() at time zone 'UTC')::date - 7;
  insert into private.assistant_request_usage(user_id, usage_date) values (auth.uid(), (now() at time zone 'UTC')::date)
    on conflict (user_id, usage_date) do update set requests = private.assistant_request_usage.requests + 1
    where private.assistant_request_usage.requests < 60 returning requests into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_assistant_request() from public, anon;
grant execute on function public.claim_assistant_request() to authenticated;

notify pgrst, 'reload schema';
commit;

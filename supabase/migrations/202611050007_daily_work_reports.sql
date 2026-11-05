-- Additive rollout. Apply after 202611050006 commits. No task/content writes.
-- Rollback: deploy the previous app and revoke authenticated EXECUTE on the
-- public daily_work_report_* RPCs. Retain tables/versions; do not drop user data.
begin;
create table if not exists public.daily_work_reports (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  author_id uuid not null, report_date date not null, timezone text not null,
  entries jsonb not null default '[]', recipient_id uuid, revision integer not null default 0,
  latest_version integer not null default 0, draft_open boolean not null default true,
  last_save_request uuid, updated_at timestamptz not null default now(),
  unique(organization_id, id), unique(organization_id, author_id, report_date),
  foreign key(organization_id, author_id) references public.profiles(organization_id, id),
  foreign key(organization_id, recipient_id) references public.profiles(organization_id, id),
  check(recipient_id is null or recipient_id <> author_id), check(jsonb_typeof(entries) = 'array')
);
create table if not exists public.daily_work_report_versions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  report_id uuid not null, author_id uuid not null, author_name text not null, job_title text,
  report_date date not null, timezone text not null, version_number integer not null,
  entries jsonb not null, recipient_id uuid not null, request_id uuid not null,
  is_latest boolean not null default true, submitted_at timestamptz not null default now(),
  checked_by uuid, checked_at timestamptz,
  foreign key(organization_id, report_id) references public.daily_work_reports(organization_id, id),
  foreign key(organization_id, author_id) references public.profiles(organization_id, id),
  foreign key(organization_id, recipient_id) references public.profiles(organization_id, id),
  foreign key(organization_id, checked_by) references public.profiles(organization_id, id),
  unique(report_id, version_number), unique(report_id, request_id),
  check(author_id <> recipient_id), check((checked_by is null) = (checked_at is null))
);
create index if not exists daily_work_reports_history on public.daily_work_reports(organization_id, author_id, report_date desc);
create index if not exists daily_work_reports_inbox on public.daily_work_report_versions(organization_id, recipient_id, submitted_at desc) where is_latest;
create unique index if not exists daily_work_reports_one_latest on public.daily_work_report_versions(report_id) where is_latest;

create or replace function private.daily_work_report_receiver(p_user uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = p_user and p.organization_id = p_org
    and p.status = 'active' and p.deactivated_at is null and p.deletion_requested_at is null and p.purged_at is null
    and exists(select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id and r.organization_id = ur.organization_id
      where ur.user_id = p.id and ur.organization_id = p_org and r.code in ('supervisor','administrator')))
$$;
revoke all on function private.daily_work_report_receiver(uuid,uuid) from public,anon,authenticated;

alter table public.daily_work_reports enable row level security;
alter table public.daily_work_report_versions enable row level security;
revoke all on public.daily_work_reports,public.daily_work_report_versions from public,anon,authenticated;
grant select on public.daily_work_reports,public.daily_work_report_versions to authenticated;
drop policy if exists daily_work_reports_own on public.daily_work_reports;
create policy daily_work_reports_own on public.daily_work_reports for select to authenticated using(
  organization_id = private.current_organization_id() and author_id = auth.uid());
-- Use the public permission wrapper in RLS; the private receiver helper remains
-- non-callable by clients, including inactive or foreign users.
create or replace function public.daily_work_report_can_receive()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.daily_work_report_receiver(auth.uid(), private.current_organization_id())
$$;
revoke all on function public.daily_work_report_can_receive() from public,anon;
grant execute on function public.daily_work_report_can_receive() to authenticated;
drop policy if exists daily_work_report_versions_read on public.daily_work_report_versions;
create policy daily_work_report_versions_read on public.daily_work_report_versions for select to authenticated using(
  organization_id = private.current_organization_id() and (author_id = auth.uid()
    or (recipient_id = auth.uid() and public.daily_work_report_can_receive())));

create or replace function public.daily_work_report_supervisors()
returns table(id uuid,display_name text) language sql stable security definer set search_path = '' as $$
  select p.id,p.display_name from public.profiles p where p.organization_id = private.current_organization_id()
    and p.id <> auth.uid() and private.daily_work_report_receiver(p.id,p.organization_id) order by p.display_name
$$;

create or replace function public.daily_work_report_authors()
returns table(id uuid,display_name text) language sql stable security definer set search_path = '' as $$
  select s.author_id,s.author_name from (
    select distinct on(v.author_id) v.author_id,v.author_name from public.daily_work_report_versions v
    where v.organization_id=private.current_organization_id() and v.recipient_id=auth.uid() and public.daily_work_report_can_receive()
    order by v.author_id,v.submitted_at desc,v.id desc
  ) s order by s.author_name limit 500
$$;

create or replace function private.validate_daily_work_entries(p_entries jsonb,p_date date,p_zone text,p_complete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e jsonb; start_min integer; end_min integer;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 100 or octet_length(p_entries::text)>180000
    then raise exception 'Use at most 100 activities' using errcode='22023'; end if;
  if p_complete and jsonb_array_length(p_entries) = 0 then raise exception 'Add an activity' using errcode='22023'; end if;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_entries)) then
    raise exception 'Duplicate activity identifiers' using errcode='22023'; end if;
  if (select count(*) <> count(distinct value->>'sourceId') from jsonb_array_elements(p_entries) where nullif(value->>'sourceId','') is not null) then
    raise exception 'Activity already imported' using errcode='22023'; end if;
  for e in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(e) <> 'object' or not(e ?& array['id','activity','remarks','start','end','nextDay','progress']) or coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(e->'activity') <> 'string' or jsonb_typeof(e->'remarks') <> 'string'
      or jsonb_typeof(e->'start') <> 'string' or jsonb_typeof(e->'end') <> 'string'
      or jsonb_typeof(e->'nextDay') <> 'boolean'
      or length(e->>'activity') > 500 or length(e->>'remarks') > 1000
      or (coalesce(e->>'start','') <> '' and e->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      or (coalesce(e->>'end','') <> '' and e->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      or (e->>'progress' is not null and (jsonb_typeof(e->'progress') <> 'number' or e->>'progress' !~ '^[0-9]{1,3}$')) then
      raise exception 'Invalid activity fields' using errcode='22023'; end if;
    if e->>'progress' is not null and (e->>'progress')::integer > 100 then raise exception 'Invalid progress' using errcode='22023'; end if;
    if nullif(e->>'sourceId','') is not null and not exists(select 1 from public.activity_logs a
      where a.id::text = e->>'sourceId' and a.actor_id = auth.uid() and a.organization_id = private.current_organization_id()) then
      raise exception 'Invalid source activity' using errcode='42501'; end if;
    if p_complete then
      if nullif(trim(e->>'activity'),'') is null or nullif(e->>'start','') is null
        or nullif(e->>'end','') is null or e->>'progress' is null then
        raise exception 'Complete every activity, time and percentage' using errcode='22023'; end if;
      start_min := extract(hour from (e->>'start')::time)::integer*60 + extract(minute from (e->>'start')::time)::integer;
      end_min := extract(hour from (e->>'end')::time)::integer*60 + extract(minute from (e->>'end')::time)::integer + case when (e->>'nextDay')::boolean then 1440 else 0 end;
      if end_min <= start_min or end_min-start_min > 1440 then raise exception 'Check activity times' using errcode='22023'; end if;
      if ((p_date + (e->>'end')::time + case when (e->>'nextDay')::boolean then interval '1 day' else interval '0' end) at time zone p_zone) > now() then
        raise exception 'Work time cannot be in the future' using errcode='22023'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_daily_work_entries(jsonb,date,text,boolean) from public,anon,authenticated;

create or replace function public.daily_work_report_save(p_date date,p_entries jsonb,p_recipient uuid,p_revision integer,p_request uuid)
returns public.daily_work_reports language plpgsql security definer set search_path = '' as $$
declare org uuid := private.current_organization_id(); zone text; r public.daily_work_reports;
begin
  if org is null then raise exception 'Active account required' using errcode='42501'; end if;
  select timezone into zone from public.organizations where id=org;
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone := 'Asia/Manila'; end if;
  if p_date is null or p_date > (now() at time zone zone)::date or p_request is null then raise exception 'Invalid report date' using errcode='22023'; end if;
  if p_recipient is not null and (p_recipient=auth.uid() or not exists(select 1 from public.profiles where id=p_recipient and organization_id=org)) then
    raise exception 'Invalid recipient' using errcode='42501'; end if;
  perform private.validate_daily_work_entries(p_entries,p_date,zone,false);
  insert into public.daily_work_reports(organization_id,author_id,report_date,timezone) values(org,auth.uid(),p_date,zone)
    on conflict(organization_id,author_id,report_date) do nothing;
  select * into r from public.daily_work_reports where organization_id=org and author_id=auth.uid() and report_date=p_date for update;
  if r.last_save_request=p_request then
    if r.entries is distinct from p_entries or r.recipient_id is distinct from p_recipient then raise exception 'Request already used' using errcode='22023'; end if;
    return r;
  end if;
  if not r.draft_open then raise exception 'Create a correction before editing' using errcode='23514'; end if;
  if r.revision is distinct from p_revision then raise exception 'Report changed in another window' using errcode='40001'; end if;
  update public.daily_work_reports set entries=p_entries,recipient_id=p_recipient,revision=revision+1,last_save_request=p_request,updated_at=now() where id=r.id returning * into r;
  return r;
end;
$$;

create or replace function public.daily_work_report_submit(p_report uuid,p_revision integer,p_request uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.daily_work_reports; v uuid; actor_name text; actor_title text;
begin
  select * into r from public.daily_work_reports where id=p_report and organization_id=private.current_organization_id() and author_id=auth.uid() for update;
  if not found then raise exception 'Report not accessible' using errcode='42501'; end if;
  select id into v from public.daily_work_report_versions where report_id=r.id and request_id=p_request;
  if v is not null then return v; end if;
  if p_request is null then raise exception 'Request required' using errcode='22023'; end if;
  if not r.draft_open then raise exception 'Report already submitted' using errcode='23514'; end if;
  if r.revision is distinct from p_revision then raise exception 'Report changed' using errcode='40001'; end if;
  if not private.daily_work_report_receiver(r.recipient_id,r.organization_id) or r.recipient_id=r.author_id then raise exception 'Choose an active supervisor' using errcode='42501'; end if;
  perform private.validate_daily_work_entries(r.entries,r.report_date,r.timezone,true);
  select display_name,job_title into actor_name,actor_title from public.profiles where id=auth.uid();
  update public.daily_work_report_versions set is_latest=false where report_id=r.id and is_latest;
  insert into public.daily_work_report_versions(organization_id,report_id,author_id,author_name,job_title,report_date,timezone,version_number,entries,recipient_id,request_id)
    values(r.organization_id,r.id,r.author_id,actor_name,actor_title,r.report_date,r.timezone,r.latest_version+1,r.entries,r.recipient_id,p_request) returning id into v;
  update public.daily_work_reports set draft_open=false,latest_version=latest_version+1,revision=revision+1,updated_at=now() where id=r.id;
  insert into public.notifications(organization_id,recipient_id,type,title,body,entity_type,entity_id,href,dedupe_key)
    values(r.organization_id,r.recipient_id,'daily_work_report_submitted','Daily report received',actor_name || ' · ' || r.report_date::text,'daily_work_report',v,'/reports?view=team&report=' || v::text,'daily-work-report:' || v::text) on conflict do nothing;
  return v;
end;
$$;

create or replace function public.daily_work_report_correct(p_report uuid,p_revision integer)
returns public.daily_work_reports language plpgsql security definer set search_path = '' as $$
declare r public.daily_work_reports;
begin
  select * into r from public.daily_work_reports where id=p_report and organization_id=private.current_organization_id() and author_id=auth.uid() for update;
  if not found then raise exception 'Report not accessible' using errcode='42501'; end if;
  if r.draft_open then return r; end if;
  if r.revision is distinct from p_revision then raise exception 'Report changed' using errcode='40001'; end if;
  update public.daily_work_reports set draft_open=true,revision=revision+1,last_save_request=null,updated_at=now() where id=r.id returning * into r;
  return r;
end;
$$;

create or replace function public.daily_work_report_check(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.daily_work_report_versions; r public.daily_work_reports;
begin
  select * into v from public.daily_work_report_versions where id=p_version and organization_id=private.current_organization_id() and recipient_id=auth.uid();
  if not found or not public.daily_work_report_can_receive() then raise exception 'Report not accessible' using errcode='42501'; end if;
  select * into r from public.daily_work_reports where id=v.report_id for update;
  select * into v from public.daily_work_report_versions where id=p_version for update;
  if not v.is_latest or r.latest_version<>v.version_number then raise exception 'A newer report is available' using errcode='40001'; end if;
  update public.daily_work_report_versions set checked_by=auth.uid(),checked_at=coalesce(checked_at,now()) where id=v.id;
end;
$$;

create or replace function public.daily_work_report_suggestions(p_date date)
returns table(id uuid,entity_id uuid,entity_type text,action text,title text,occurred_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id,s.entity_id,s.entity_type,s.action,s.title,s.created_at from (
    select distinct on(a.entity_type,a.entity_id,a.action) a.id,a.entity_id,a.entity_type,a.action,a.created_at,
      coalesce(t.title,c.title,'Work activity') as title
    from public.activity_logs a join public.organizations o on o.id=a.organization_id
    left join public.daily_work_reports wr on wr.organization_id=a.organization_id and wr.author_id=auth.uid() and wr.report_date=p_date
    left join public.tasks t on a.entity_type='task' and t.id=a.entity_id and t.organization_id=a.organization_id
    left join public.content_items c on a.entity_type='content_item' and c.id=a.entity_id and c.organization_id=a.organization_id
    cross join lateral(select case when exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(wr.timezone,o.timezone))
      then coalesce(wr.timezone,o.timezone) else 'Asia/Manila' end as timezone) z
    where a.organization_id=private.current_organization_id() and a.actor_id=auth.uid()
      and a.created_at >= (p_date::timestamp at time zone z.timezone)
      and a.created_at < ((p_date+1)::timestamp at time zone z.timezone)
      and private.can_read_activity(a.entity_type,a.entity_id)
      and (a.action in ('TASK_SUBMITTED_FOR_REVIEW','TASK_REVIEW_APPROVED','TASK_CHANGES_REQUESTED','CONTENT_SUBMITTED_FOR_REVIEW','CONTENT_REVIEW_APPROVED','CONTENT_CHANGES_REQUESTED','CONTENT_SENT_TO_CLIENT','CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED','CONTENT_POSTING_SCHEDULED')
        or (a.action='TASK_STATUS_CHANGED' and a.metadata->>'to'='in_progress'))
    order by a.entity_type,a.entity_id,a.action,a.created_at desc,a.id
  ) s order by s.created_at desc,s.id limit 100
$$;

revoke all on function public.daily_work_report_authors(),public.daily_work_report_supervisors(),public.daily_work_report_save(date,jsonb,uuid,integer,uuid),public.daily_work_report_submit(uuid,integer,uuid),public.daily_work_report_correct(uuid,integer),public.daily_work_report_check(uuid),public.daily_work_report_suggestions(date) from public,anon;
grant execute on function public.daily_work_report_authors(),public.daily_work_report_supervisors(),public.daily_work_report_save(date,jsonb,uuid,integer,uuid),public.daily_work_report_submit(uuid,integer,uuid),public.daily_work_report_correct(uuid,integer),public.daily_work_report_check(uuid),public.daily_work_report_suggestions(date) to authenticated;
notify pgrst,'reload schema';
commit;

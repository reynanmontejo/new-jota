-- Apply after 202611050006 and 202611050007. This is an additive function
-- update: no report dates, entries, submitted versions or workspace settings
-- are rewritten. Deploy the matching app after applying this migration.
-- Rollback: deploy the previous app, then restore the save/suggestions function
-- definitions from 202611050007. Keep the report data and calendar helper.
begin;

create or replace function private.daily_work_report_timezone(p_org uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare zone text;
begin
  select coalesce(nullif(p.timezone,''),nullif(o.timezone,''),'Asia/Manila') into zone
    from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.organization_id=p_org;
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:='Asia/Manila'; end if;
  return zone;
end;
$$;
revoke all on function private.daily_work_report_timezone(uuid) from public,anon,authenticated;

create or replace function public.daily_work_report_calendar()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare org uuid:=private.current_organization_id(); zone text;
begin
  if org is null then raise exception 'Active account required' using errcode='42501'; end if;
  zone:=private.daily_work_report_timezone(org);
  return jsonb_build_object('timezone',zone,'today',(now() at time zone zone)::date::text);
end;
$$;
revoke all on function public.daily_work_report_calendar() from public,anon;
grant execute on function public.daily_work_report_calendar() to authenticated;

create or replace function public.daily_work_report_save(p_date date,p_entries jsonb,p_recipient uuid,p_revision integer,p_request uuid)
returns public.daily_work_reports language plpgsql security definer set search_path = '' as $$
declare org uuid := private.current_organization_id(); zone text; r public.daily_work_reports;
begin
  if org is null then raise exception 'Active account required' using errcode='42501'; end if;
  zone := private.daily_work_report_timezone(org);
  if p_date is null or p_request is null then raise exception 'Invalid report date' using errcode='22023'; end if;
  -- Preserve access to saved reports when a later profile-zone change places
  -- their original reporting date ahead of today's date in the new zone.
  if p_date > (now() at time zone zone)::date and not exists(select 1 from public.daily_work_reports
    where organization_id=org and author_id=auth.uid() and report_date=p_date) then
    raise exception 'Invalid report date' using errcode='22023';
  end if;
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
    cross join lateral(select coalesce(wr.timezone,private.daily_work_report_timezone(a.organization_id)) as timezone) z
    where a.organization_id=private.current_organization_id() and a.actor_id=auth.uid()
      and a.created_at >= (p_date::timestamp at time zone z.timezone)
      and a.created_at < ((p_date+1)::timestamp at time zone z.timezone)
      and private.can_read_activity(a.entity_type,a.entity_id)
      and (a.action in ('TASK_SUBMITTED_FOR_REVIEW','TASK_REVIEW_APPROVED','TASK_CHANGES_REQUESTED','CONTENT_SUBMITTED_FOR_REVIEW','CONTENT_REVIEW_APPROVED','CONTENT_CHANGES_REQUESTED','CONTENT_SENT_TO_CLIENT','CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED','CONTENT_POSTING_SCHEDULED')
        or (a.action='TASK_STATUS_CHANGED' and a.metadata->>'to'='in_progress'))
    order by a.entity_type,a.entity_id,a.action,a.created_at desc,a.id
  ) s order by s.created_at desc,s.id limit 100
$$;


notify pgrst,'reload schema';
commit;

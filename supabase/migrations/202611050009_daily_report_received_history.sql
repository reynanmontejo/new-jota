-- Additive, read-only inbox fix. No report entries, recipients, versions or
-- check acknowledgments are changed. Apply after 202611050008.
-- Rollback: deploy the previous app and revoke SELECT on this view from
-- authenticated. Retain the version history and index.
begin;
create index if not exists daily_work_reports_recipient_history
  on public.daily_work_report_versions(organization_id,recipient_id,report_id,version_number desc);

-- security_invoker preserves the existing underlying table permissions and
-- RLS. The explicit recipient filter also keeps authors out of this inbox.
create or replace view public.daily_work_report_received
with (security_invoker=true) as
  select distinct on (v.organization_id,v.report_id,v.recipient_id)
    v.id,v.organization_id,v.report_id,v.author_id,v.author_name,v.job_title,
    v.report_date,v.timezone,v.version_number,v.recipient_id,v.submitted_at,
    v.checked_at,v.checked_by,v.is_latest
  from public.daily_work_report_versions v
  where v.organization_id=private.current_organization_id()
    and v.recipient_id=auth.uid() and public.daily_work_report_can_receive()
  order by v.organization_id,v.report_id,v.recipient_id,v.version_number desc;
revoke all on public.daily_work_report_received from public,anon,authenticated;
grant select on public.daily_work_report_received to authenticated;
notify pgrst,'reload schema';
commit;

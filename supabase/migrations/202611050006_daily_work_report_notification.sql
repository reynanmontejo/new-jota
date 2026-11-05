-- Apply and COMMIT this migration before 202611050007.
begin;
alter type public.notification_type add value if not exists 'daily_work_report_submitted';
commit;

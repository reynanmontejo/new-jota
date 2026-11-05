-- Commit this enum addition before the report functions can emit it.
-- Additive and safe for older app versions; retain the value on app rollback.
begin;
alter type public.notification_type add value if not exists 'daily_report_submitted';
commit;

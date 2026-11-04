begin;
-- Commit the enum expansion before the next migration uses it.
alter type public.client_member_role add value if not exists 'video_backup';
commit;

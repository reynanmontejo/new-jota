begin;

-- Make task workflow changes available to authenticated Supabase Realtime clients.
-- The app still fetches the changed rows through the user's RLS-protected session.
-- PGLITE_SKIP_START
do $$
declare
  table_name text;
  workflow_tables text[] := array[
    'tasks',
    'task_assignees',
    'task_checklist_items',
    'comments',
    'activity_logs',
    'submissions',
    'submission_versions',
    'submission_version_files',
    'reviews'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is unavailable';
  end if;

  foreach table_name in array workflow_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
-- PGLITE_SKIP_END

commit;

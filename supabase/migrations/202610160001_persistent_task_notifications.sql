begin;

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_recipient_dedupe_uidx
  on public.notifications (organization_id, recipient_id, dedupe_key);

create table if not exists public.notification_preferences (
  organization_id uuid not null,
  user_id uuid not null,
  sound_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id) references public.profiles(organization_id, id) on delete cascade
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_read_own on public.notification_preferences;
create policy notification_preferences_read_own on public.notification_preferences for select to authenticated
  using (organization_id = (select private.current_organization_id()) and user_id = (select auth.uid()));
grant select on public.notifications, public.notification_preferences to authenticated;

create or replace function private.enqueue_notification(
  p_organization_id uuid, p_recipient_id uuid, p_type public.notification_type,
  p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_href text, p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null or p_dedupe_key is null or trim(p_dedupe_key) = '' then return; end if;
  insert into public.notifications (
    organization_id, recipient_id, type, title, body, entity_type, entity_id, href, dedupe_key
  ) values (
    p_organization_id, p_recipient_id, p_type, left(trim(p_title), 180), nullif(trim(coalesce(p_body, '')), ''),
    p_entity_type, p_entity_id, p_href, p_dedupe_key
  ) on conflict (organization_id, recipient_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.notify_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
begin
  if new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.removed_at is null then return new; end if;
  if new.user_id = new.assigned_by then return new; end if;
  select t.title into task_title from public.tasks t
  where t.organization_id = new.organization_id and t.id = new.task_id and t.deleted_at is null;
  if task_title is null then return new; end if;
  perform private.enqueue_notification(
    new.organization_id, new.user_id, 'task_assigned', 'Task assigned: ' || task_title,
    'You have been assigned to this task.', 'task', new.task_id, '/tasks/' || new.task_id::text,
    'task-assigned:' || new.task_id::text || ':' || new.user_id::text || ':' || new.assigned_at::text
  );
  return new;
end;
$$;

create or replace function private.notify_task_submission_reviewers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
  submitter_name text;
  reviewer_id uuid;
begin
  if new.status <> 'submitted' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'submitted'
    and old.current_version_number = new.current_version_number then return new; end if;
  select t.title into task_title from public.tasks t
  where t.organization_id = new.organization_id and t.id = new.task_id;
  select p.display_name into submitter_name from public.profiles p
  where p.organization_id = new.organization_id and p.id = new.submitted_by;
  for reviewer_id in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_permissions rp on rp.organization_id = ur.organization_id and rp.role_id = ur.role_id
    join public.profiles p on p.organization_id = ur.organization_id and p.id = ur.user_id
    where ur.organization_id = new.organization_id and rp.permission_code = 'tasks.review'
      and p.status = 'active' and p.deactivated_at is null and ur.user_id <> new.submitted_by
  loop
    perform private.enqueue_notification(
      new.organization_id, reviewer_id, 'submitted_for_review', 'Work ready for review: ' || coalesce(task_title, 'Task'),
      coalesce(submitter_name, 'A teammate') || ' submitted version ' || new.current_version_number::text || ' for review.',
      'task', new.task_id, '/reviews',
      'task-submission:' || new.id::text || ':' || new.current_version_number::text || ':' || reviewer_id::text
    );
  end loop;
  return new;
end;
$$;

create or replace function private.notify_task_review_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_id uuid;
  task_title text;
  version_number integer;
  submitter_id uuid;
begin
  select v.task_id, v.version_number, v.submitted_by, t.title
    into task_id, version_number, submitter_id, task_title
  from public.submission_versions v
  join public.tasks t on t.organization_id = v.organization_id and t.id = v.task_id
  where v.organization_id = new.organization_id and v.id = new.submission_version_id;
  if submitter_id is null or submitter_id = new.reviewer_id then return new; end if;
  perform private.enqueue_notification(
    new.organization_id, submitter_id,
    case when new.decision = 'revision_requested' then 'revision_requested'::public.notification_type
      else 'submission_approved'::public.notification_type end,
    case when new.decision = 'revision_requested' then 'Revision requested: ' || coalesce(task_title, 'Task')
      else 'Work approved: ' || coalesce(task_title, 'Task') end,
    coalesce(new.comment, case when new.decision = 'revision_requested' then 'Please review the requested changes.' else 'Your submitted work was approved.' end),
    'task', task_id, '/tasks/' || task_id::text, 'task-review:' || new.submission_version_id::text
  );
  return new;
end;
$$;

drop trigger if exists task_assignee_notification on public.task_assignees;
create trigger task_assignee_notification after insert or update of removed_at on public.task_assignees
  for each row execute function private.notify_task_assignee();
drop trigger if exists task_submission_reviewers_notification on public.submissions;
create trigger task_submission_reviewers_notification after insert or update on public.submissions
  for each row execute function private.notify_task_submission_reviewers();
drop trigger if exists task_review_decision_notification on public.reviews;
create trigger task_review_decision_notification after insert on public.reviews
  for each row execute function private.notify_task_review_decision();

create or replace function public.mark_notification_read_for_current_user(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  changed_count integer;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and organization_id = org_id and recipient_id = actor_id;
  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

create or replace function public.mark_all_notifications_read_for_current_user()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  changed_count integer;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
  where organization_id = org_id and recipient_id = actor_id and read_at is null;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function public.set_notification_sound_preference_for_current_user(p_sound_enabled boolean)
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
  insert into public.notification_preferences (organization_id, user_id, sound_enabled, updated_at)
  values (org_id, actor_id, coalesce(p_sound_enabled, false), now())
  on conflict (organization_id, user_id) do update
    set sound_enabled = excluded.sound_enabled, updated_at = now();
end;
$$;

revoke all on function private.enqueue_notification(uuid, uuid, public.notification_type, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function private.notify_task_assignee() from public, anon, authenticated;
revoke all on function private.notify_task_submission_reviewers() from public, anon, authenticated;
revoke all on function private.notify_task_review_decision() from public, anon, authenticated;
revoke all on function public.mark_notification_read_for_current_user(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read_for_current_user() from public, anon;
revoke all on function public.set_notification_sound_preference_for_current_user(boolean) from public, anon;
grant execute on function public.mark_notification_read_for_current_user(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read_for_current_user() to authenticated;
grant execute on function public.set_notification_sound_preference_for_current_user(boolean) to authenticated;

-- PGLITE_SKIP_START
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['notifications', 'notification_preferences'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
-- PGLITE_SKIP_END

commit;

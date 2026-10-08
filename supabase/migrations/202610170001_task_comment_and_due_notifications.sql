begin;

create or replace function private.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_title text;
  author_name text;
  recipient_id uuid;
begin
  if new.deleted_at is not null then return new; end if;
  select task.title into task_title from public.tasks task
  where task.organization_id = new.organization_id and task.id = new.task_id and task.deleted_at is null;
  if task_title is null then return new; end if;
  select profile.display_name into author_name from public.profiles profile
  where profile.organization_id = new.organization_id and profile.id = new.author_id;

  for recipient_id in
    select distinct recipients.user_id
    from (
      select assignee.user_id
      from public.task_assignees assignee
      join public.profiles profile on profile.organization_id = assignee.organization_id and profile.id = assignee.user_id
      where assignee.organization_id = new.organization_id and assignee.task_id = new.task_id
        and assignee.removed_at is null and profile.status = 'active' and profile.deactivated_at is null
      union
      select task.created_by from public.tasks task
      join public.profiles profile on profile.organization_id = task.organization_id and profile.id = task.created_by
      where task.organization_id = new.organization_id and task.id = new.task_id
        and task.created_by is not null and profile.status = 'active' and profile.deactivated_at is null
    ) recipients
    where recipients.user_id <> new.author_id
  loop
    perform private.enqueue_notification(
      new.organization_id, recipient_id, 'comment_added', 'New comment: ' || task_title,
      coalesce(author_name, 'A teammate') || ': ' || left(trim(new.body), 300),
      'task', new.task_id, '/tasks/' || new.task_id::text,
      'task-comment:' || new.id::text || ':' || recipient_id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists task_comment_notification on public.comments;
create trigger task_comment_notification after insert on public.comments
  for each row execute function private.notify_task_comment();

create or replace function private.emit_task_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_task record;
  emitted_count integer := 0;
  overdue_day integer;
begin
  for due_task in
    select task.organization_id, task.id as task_id, task.title, task.due_at, assignee.user_id
    from public.tasks task
    join public.task_assignees assignee on assignee.organization_id = task.organization_id and assignee.task_id = task.id
    join public.profiles profile on profile.organization_id = assignee.organization_id and profile.id = assignee.user_id
    where task.deleted_at is null and task.due_at is not null
      and task.status not in ('completed', 'approved', 'cancelled')
      and assignee.removed_at is null and profile.status = 'active' and profile.deactivated_at is null
      and task.due_at <= now() + interval '24 hours'
  loop
    if due_task.due_at > now() then
      perform private.enqueue_notification(
        due_task.organization_id, due_task.user_id, 'task_due_soon', 'Due soon: ' || due_task.title,
        'This task is due within 24 hours.', 'task', due_task.task_id, '/tasks/' || due_task.task_id::text,
        'task-due-soon:' || due_task.task_id::text || ':' || due_task.user_id::text || ':' || due_task.due_at::date::text
      );
    else
      overdue_day := floor(extract(epoch from (now() - due_task.due_at)) / 86400)::integer;
      perform private.enqueue_notification(
        due_task.organization_id, due_task.user_id, 'task_overdue', 'Overdue: ' || due_task.title,
        'This task is overdue. Review its status or due date.', 'task', due_task.task_id, '/tasks/' || due_task.task_id::text,
        'task-overdue:' || due_task.task_id::text || ':' || due_task.user_id::text || ':' || overdue_day::text
      );
    end if;
    emitted_count := emitted_count + 1;
  end loop;
  return emitted_count;
end;
$$;

revoke all on function private.notify_task_comment() from public, anon, authenticated;
revoke all on function private.emit_task_due_notifications() from public, anon, authenticated;

-- Hourly reminders: one due-soon alert within 24 hours and a daily overdue reminder.
select cron.unschedule(jobid) from cron.job where jobname = 'emit-task-due-notifications';
select cron.schedule('emit-task-due-notifications', '0 * * * *', 'select private.emit_task_due_notifications()');

commit;

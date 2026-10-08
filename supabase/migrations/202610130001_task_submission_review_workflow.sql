begin;

-- The original schema already models task submissions, immutable versions,
-- linked task files, and reviews. This migration activates that model for the
-- authenticated workflow instead of adding a parallel task-review schema.
insert into public.permissions (code, description)
values ('tasks.submit', 'Submit assigned task work for supervisor review')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'tasks.submit'
from public.roles r
where lower(r.code::text) in ('account_manager', 'supervisor', 'administrator')
on conflict do nothing;

drop trigger if exists task_submission_version_files_are_immutable on public.submission_version_files;
create trigger task_submission_version_files_are_immutable
  before update or delete on public.submission_version_files
  for each row execute function public.prevent_immutable_record_changes();

create or replace function public.submit_task_for_review(
  p_task_id uuid,
  p_attachment_ids uuid[],
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype;
  submission_row public.submissions%rowtype;
  has_submission boolean := false;
  next_version integer;
  matched_files integer;
  new_files integer;
  version_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.submit') then
    raise exception 'Task submission is not permitted' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_attachment_ids), 0) not between 1 and 30
    or char_length(coalesce(p_notes, '')) > 5000 then
    raise exception 'Choose 1 to 30 files and keep notes under 5,000 characters' using errcode = '22023';
  end if;

  select * into task_row
  from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null
  for update;
  if not found or not private.can_access_task(p_task_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null
  ) then
    raise exception 'Only the active primary task owner can submit work' using errcode = '42501';
  end if;
  if task_row.status not in ('todo', 'in_progress', 'revision_requested') then
    raise exception 'This task is not in a state that can be submitted' using errcode = '22023';
  end if;

  select count(*) into matched_files
  from public.attachments a
  where a.organization_id = org_id and a.task_id = p_task_id
    and a.client_id = task_row.client_id and a.deleted_at is null
    and a.id = any(p_attachment_ids);
  if matched_files <> cardinality(p_attachment_ids) then
    raise exception 'One or more selected files are unavailable for this task' using errcode = '22023';
  end if;

  select * into submission_row
  from public.submissions s
  where s.organization_id = org_id and s.task_id = p_task_id
  for update;
  has_submission := found;
  if has_submission and submission_row.status = 'submitted' then
    raise exception 'This task is already awaiting review' using errcode = '22023';
  end if;
  if has_submission and submission_row.status <> 'revision_requested' then
    raise exception 'This task submission cannot be resubmitted in its current state' using errcode = '22023';
  end if;
  if has_submission then
    select count(*) into new_files
    from public.attachments a
    where a.organization_id = org_id and a.task_id = p_task_id
      and a.deleted_at is null and a.id = any(p_attachment_ids)
      and a.created_at > (
        select max(v.submitted_at) from public.submission_versions v
        where v.organization_id = org_id and v.submission_id = submission_row.id
      );
    if new_files = 0 then
      raise exception 'Upload at least one new file before resubmitting' using errcode = '22023';
    end if;
  end if;

  if not has_submission then
    insert into public.submissions (
      organization_id, task_id, status, current_version_number, submitted_by, submitted_at
    ) values (org_id, p_task_id, 'submitted', 1, actor_id, now())
    returning * into submission_row;
    next_version := 1;
  else
    next_version := submission_row.current_version_number + 1;
    update public.submissions
    set status = 'submitted', current_version_number = next_version,
        submitted_by = actor_id, submitted_at = now(), approved_at = null,
        updated_at = now()
    where id = submission_row.id and organization_id = org_id
    returning * into submission_row;
  end if;

  insert into public.submission_versions (
    organization_id, task_id, submission_id, version_number, notes, submitted_by
  ) values (org_id, p_task_id, submission_row.id, next_version,
    nullif(trim(coalesce(p_notes, '')), ''), actor_id)
  returning id into version_id;

  insert into public.submission_version_files (
    organization_id, task_id, submission_version_id, attachment_id
  )
  select org_id, p_task_id, version_id, selected.attachment_id
  from (select distinct unnest(p_attachment_ids) as attachment_id) selected;

  update public.tasks
  set status = 'for_review', updated_at = now()
  where id = p_task_id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_SUBMITTED_FOR_REVIEW',
    jsonb_build_object('submission_id', submission_row.id, 'version_id', version_id,
      'version_number', next_version, 'file_count', cardinality(p_attachment_ids)));

  return version_id;
end;
$$;

create or replace function public.review_task_submission(
  p_submission_version_id uuid,
  p_decision public.review_decision,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  submission_row public.submissions%rowtype;
  version_row public.submission_versions%rowtype;
  task_row public.tasks%rowtype;
  feedback text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.review') then
    raise exception 'Task review is not permitted' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'revision_requested') then
    raise exception 'Choose approve or request changes' using errcode = '22023';
  end if;
  if p_decision = 'approved' and not private.has_permission('tasks.approve') then
    raise exception 'Task approval is not permitted' using errcode = '42501';
  end if;
  if p_decision = 'revision_requested' and feedback is null then
    raise exception 'Add feedback when requesting changes' using errcode = '22023';
  end if;
  if char_length(coalesce(feedback, '')) > 5000 then
    raise exception 'Review feedback is too long' using errcode = '22023';
  end if;

  select s.* into submission_row
  from public.submission_versions v
  join public.submissions s
    on s.organization_id = v.organization_id and s.id = v.submission_id
  where v.id = p_submission_version_id and v.organization_id = org_id
  for update of s;
  if not found then raise exception 'Submission version not found' using errcode = 'P0002'; end if;

  select * into version_row from public.submission_versions v
  where v.id = p_submission_version_id and v.organization_id = org_id;
  select * into task_row from public.tasks t
  where t.id = submission_row.task_id and t.organization_id = org_id and t.deleted_at is null
  for update;
  if not found or not private.can_access_task(task_row.id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if submission_row.status <> 'submitted'
    or submission_row.current_version_number <> version_row.version_number
    or task_row.status <> 'for_review' then
    raise exception 'Only the latest pending task version can be reviewed' using errcode = '22023';
  end if;
  if version_row.submitted_by = actor_id then
    raise exception 'You cannot review your own submission' using errcode = '42501';
  end if;

  insert into public.reviews (organization_id, submission_version_id, reviewer_id, decision, comment)
  values (org_id, p_submission_version_id, actor_id, p_decision, feedback);

  update public.submissions
  set status = p_decision::text::public.submission_status,
      approved_at = case when p_decision = 'approved' then now() else null end,
      updated_at = now()
  where id = submission_row.id and organization_id = org_id;

  update public.tasks
  set status = case when p_decision = 'approved'
    then 'approved'::public.task_status else 'revision_requested'::public.task_status end,
      updated_at = now()
  where id = task_row.id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_row.id,
    case when p_decision = 'approved' then 'TASK_REVIEW_APPROVED' else 'TASK_CHANGES_REQUESTED' end,
    jsonb_build_object('submission_id', submission_row.id, 'version_id', p_submission_version_id,
      'version_number', version_row.version_number, 'decision', p_decision, 'comment', feedback));
end;
$$;

revoke all on function public.submit_task_for_review(uuid, uuid[], text) from public, anon;
revoke all on function public.review_task_submission(uuid, public.review_decision, text) from public, anon;
grant execute on function public.submit_task_for_review(uuid, uuid[], text) to authenticated;
grant execute on function public.review_task_submission(uuid, public.review_decision, text) to authenticated;

commit;

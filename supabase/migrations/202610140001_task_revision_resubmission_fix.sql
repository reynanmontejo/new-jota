begin;

-- A revision must include at least one file that was not part of an earlier
-- submitted version. Use version-file membership as the source of truth, with
-- an inclusive timestamp boundary to avoid rejecting same-tick uploads.
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
      and a.client_id = task_row.client_id and a.deleted_at is null
      and a.id = any(p_attachment_ids)
      and a.created_at >= (
        select max(v.submitted_at) from public.submission_versions v
        where v.organization_id = org_id and v.submission_id = submission_row.id
      )
      and not exists (
        select 1
        from public.submission_version_files svf
        join public.submission_versions v
          on v.organization_id = svf.organization_id
          and v.id = svf.submission_version_id
        where v.organization_id = org_id
          and v.submission_id = submission_row.id
          and svf.attachment_id = a.id
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

revoke all on function public.submit_task_for_review(uuid, uuid[], text) from public, anon;
grant execute on function public.submit_task_for_review(uuid, uuid[], text) to authenticated;

commit;

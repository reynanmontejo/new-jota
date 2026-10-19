begin;

-- General tasks may belong to the organization without being attached to a client.
alter table public.tasks alter column client_id drop not null;
alter table public.attachments alter column client_id drop not null;

-- Keep task ownership/org integrity when an attachment has no client. The
-- existing composite client/task FK continues to validate client-linked files.
alter table public.attachments drop constraint if exists attachments_organization_id_client_id_task_id_fkey;
alter table public.attachments
  add constraint attachments_organization_id_task_id_fkey
  foreign key (organization_id, task_id)
  references public.tasks(organization_id, id) on delete restrict;
alter table public.attachments
  add constraint attachments_organization_id_client_id_task_id_fkey
  foreign key (organization_id, client_id, task_id)
  references public.tasks(organization_id, client_id, id) on delete restrict;

create or replace function public.workflow_create_task(
  p_title text,
  p_client_id uuid,
  p_campaign_name text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  assignee_id uuid := coalesce(p_assigned_to, auth.uid());
  task_id uuid;
  matched_campaign_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.create') then
    raise exception 'Task creation is not permitted' using errcode = '42501';
  end if;
  if p_client_id is not null and not private.can_access_client(p_client_id) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;
  if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
    raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = assignee_id and p.organization_id = org_id
      and p.status = 'active' and p.deactivated_at is null
  ) then
    raise exception 'Choose an active employee in this organization' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_campaign_name, '')), '') is not null then
    if p_client_id is null then
      raise exception 'A client is required when linking a task to a campaign' using errcode = '22023';
    end if;
    select c.id into matched_campaign_id
    from public.campaigns c
    where c.organization_id = org_id and c.client_id = p_client_id
      and lower(trim(c.name)) = lower(trim(p_campaign_name)) and c.deleted_at is null
    limit 1;
    if matched_campaign_id is null then
      raise exception 'Choose an active campaign belonging to this client' using errcode = '22023';
    end if;
  end if;

  insert into public.tasks (organization_id, client_id, campaign_id, title, status, priority, due_at, created_by)
  values (org_id, p_client_id, matched_campaign_id, trim(p_title), 'todo', p_priority, p_due_at, actor_id)
  returning id into task_id;

  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
  values (org_id, task_id, assignee_id, true, actor_id);

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_id, 'TASK_CREATED', jsonb_build_object(
    'title', trim(p_title), 'assigned_to', assignee_id, 'campaign_id', matched_campaign_id,
    'client_id', p_client_id
  ));
  if assignee_id <> actor_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', task_id, 'TASK_ASSIGNED', jsonb_build_object('assigned_to', assignee_id));
  end if;
  return task_id;
end;
$$;

create or replace function public.workflow_list_task_trash()
returns table (task_id uuid, title text, client_name text, deleted_at timestamptz, created_by uuid, assigned_to uuid)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.title, coalesce(c.name, 'No client'), t.deleted_at, t.created_by,
    (select ta.user_id from public.task_assignees ta where ta.organization_id = t.organization_id
      and ta.task_id = t.id and ta.is_primary and ta.removed_at is null limit 1)
  from public.tasks t
  left join public.clients c on c.id = t.client_id and c.organization_id = t.organization_id
  where t.organization_id = private.current_organization_id() and t.deleted_at is not null
    and (private.has_permission('tasks.trash') or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta where ta.organization_id = t.organization_id
        and ta.task_id = t.id and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null))
  order by t.deleted_at desc
$$;

create or replace function public.workflow_restore_task_from_trash(p_task_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype; is_owner boolean;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  select * into task_row from public.tasks t where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is not null for update;
  if not found then raise exception 'Trashed task not found' using errcode = 'P0002'; end if;
  select task_row.created_by = actor_id or exists (select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Restoring this task is not permitted' using errcode = '42501';
  end if;
  if task_row.client_id is not null and not private.can_access_client(task_row.client_id)
    and not private.has_permission('tasks.trash') then
    raise exception 'Client access is no longer permitted' using errcode = '42501';
  end if;
  update public.tasks set deleted_at = null where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_RESTORED_FROM_TRASH');
end;
$$;

create or replace function public.workflow_list_task_archive()
returns table (task_id uuid, title text, client_name text, status public.task_status, archived_at timestamptz, archived_by uuid, created_by uuid, assigned_to uuid)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.title, coalesce(c.name, 'No client'), t.status, t.archived_at, t.archived_by, t.created_by,
    (select ta.user_id from public.task_assignees ta where ta.organization_id = t.organization_id
      and ta.task_id = t.id and ta.is_primary and ta.removed_at is null limit 1)
  from public.tasks t
  left join public.clients c on c.id = t.client_id and c.organization_id = t.organization_id
  where t.organization_id = private.current_organization_id() and t.archived_at is not null and t.deleted_at is null
    and (private.has_permission('tasks.trash') or t.created_by = auth.uid()
      or exists (select 1 from public.task_assignees ta where ta.organization_id = t.organization_id
        and ta.task_id = t.id and ta.user_id = auth.uid() and ta.is_primary and ta.removed_at is null))
  order by t.archived_at desc
$$;

create or replace function public.workflow_restore_task_from_archive(p_task_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype; is_owner boolean;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  select * into task_row from public.tasks t where t.id = p_task_id and t.organization_id = org_id
    and t.archived_at is not null and t.deleted_at is null for update;
  if not found then raise exception 'Archived task not found' using errcode = 'P0002'; end if;
  select task_row.created_by = actor_id or exists (select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null) into is_owner;
  if not coalesce(private.has_permission('tasks.trash'), false) and not coalesce(is_owner, false) then
    raise exception 'Restoring this task is not permitted' using errcode = '42501';
  end if;
  if task_row.client_id is not null and not private.can_access_client(task_row.client_id)
    and not private.has_permission('tasks.trash') then
    raise exception 'Client access is no longer permitted' using errcode = '42501';
  end if;
  update public.tasks set archived_at = null, archived_by = null, updated_at = now()
  where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'task', p_task_id, 'TASK_RESTORED_FROM_ARCHIVE');
end;
$$;

create or replace function public.submit_task_for_review(p_task_id uuid, p_attachment_ids uuid[], p_notes text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid(); org_id uuid := private.current_organization_id();
  task_row public.tasks%rowtype; submission_row public.submissions%rowtype;
  has_submission boolean := false; next_version integer; matched_files integer; new_files integer; version_id uuid;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('tasks.submit') then raise exception 'Task submission is not permitted' using errcode = '42501'; end if;
  if coalesce(cardinality(p_attachment_ids), 0) not between 1 and 30 or char_length(coalesce(p_notes, '')) > 5000 then
    raise exception 'Choose 1 to 30 files and keep notes under 5,000 characters' using errcode = '22023';
  end if;
  select * into task_row from public.tasks t where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null for update;
  if not found or not private.can_access_task(p_task_id) then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.task_assignees ta where ta.organization_id = org_id and ta.task_id = p_task_id
    and ta.user_id = actor_id and ta.is_primary and ta.removed_at is null) then
    raise exception 'Only the active primary task owner can submit work' using errcode = '42501';
  end if;
  if task_row.status not in ('todo', 'in_progress', 'revision_requested') then raise exception 'This task is not in a state that can be submitted' using errcode = '22023'; end if;
  select count(*) into matched_files from public.attachments a where a.organization_id = org_id and a.task_id = p_task_id
    and a.client_id is not distinct from task_row.client_id and a.deleted_at is null and a.id = any(p_attachment_ids);
  if matched_files <> cardinality(p_attachment_ids) then raise exception 'One or more selected files are unavailable for this task' using errcode = '22023'; end if;
  select * into submission_row from public.submissions s where s.organization_id = org_id and s.task_id = p_task_id for update;
  has_submission := found;
  if has_submission and submission_row.status = 'submitted' then raise exception 'This task is already awaiting review' using errcode = '22023'; end if;
  if has_submission and submission_row.status <> 'revision_requested' then raise exception 'This task submission cannot be resubmitted in its current state' using errcode = '22023'; end if;
  if has_submission then
    select count(*) into new_files from public.attachments a where a.organization_id = org_id and a.task_id = p_task_id
      and a.client_id is not distinct from task_row.client_id and a.deleted_at is null and a.id = any(p_attachment_ids)
      and a.created_at >= (select max(v.submitted_at) from public.submission_versions v where v.organization_id = org_id and v.submission_id = submission_row.id)
      and not exists (select 1 from public.submission_version_files svf join public.submission_versions v
        on v.organization_id = svf.organization_id and v.id = svf.submission_version_id
        where v.organization_id = org_id and v.submission_id = submission_row.id and svf.attachment_id = a.id);
    if new_files = 0 then raise exception 'Upload at least one new file before resubmitting' using errcode = '22023'; end if;
  end if;
  if not has_submission then
    insert into public.submissions (organization_id, task_id, status, current_version_number, submitted_by, submitted_at)
      values (org_id, p_task_id, 'submitted', 1, actor_id, now()) returning * into submission_row;
    next_version := 1;
  else
    next_version := submission_row.current_version_number + 1;
    update public.submissions set status = 'submitted', current_version_number = next_version, submitted_by = actor_id,
      submitted_at = now(), approved_at = null, updated_at = now()
      where id = submission_row.id and organization_id = org_id returning * into submission_row;
  end if;
  insert into public.submission_versions (organization_id, task_id, submission_id, version_number, notes, submitted_by)
    values (org_id, p_task_id, submission_row.id, next_version, nullif(trim(coalesce(p_notes, '')), ''), actor_id)
    returning id into version_id;
  insert into public.submission_version_files (organization_id, task_id, submission_version_id, attachment_id)
    select org_id, p_task_id, version_id, selected.attachment_id
    from (select distinct unnest(p_attachment_ids) as attachment_id) selected;
  update public.tasks set status = 'for_review', updated_at = now() where id = p_task_id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', p_task_id, 'TASK_SUBMITTED_FOR_REVIEW', jsonb_build_object(
      'submission_id', submission_row.id, 'version_id', version_id, 'version_number', next_version, 'file_count', cardinality(p_attachment_ids)));
  return version_id;
end;
$$;

revoke all on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) from public, anon;
grant execute on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) to authenticated;
revoke all on function public.workflow_list_task_trash() from public, anon;
grant execute on function public.workflow_list_task_trash() to authenticated;
revoke all on function public.workflow_restore_task_from_trash(uuid) from public, anon;
grant execute on function public.workflow_restore_task_from_trash(uuid) to authenticated;
revoke all on function public.workflow_list_task_archive() from public, anon;
grant execute on function public.workflow_list_task_archive() to authenticated;
revoke all on function public.workflow_restore_task_from_archive(uuid) from public, anon;
grant execute on function public.workflow_restore_task_from_archive(uuid) to authenticated;
revoke all on function public.submit_task_for_review(uuid, uuid[], text) from public, anon;
grant execute on function public.submit_task_for_review(uuid, uuid[], text) to authenticated;

commit;

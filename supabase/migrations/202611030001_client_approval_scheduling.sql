begin;

-- Forward-only workflow change: existing approvals, schedules, and external decisions are preserved.
-- The client is contacted outside Jota. Pending approval does not mean a message was sent.
create or replace function private.queue_content_client_approval(p_content_id uuid, p_version_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item_row public.content_items%rowtype;
  manager_id uuid;
begin
  select * into item_row from public.content_items where id = p_content_id for update;
  perform pg_catalog.set_config('jota.client_handoff_write', 'on', true);
  perform pg_catalog.set_config('jota.external_client_decision_write', 'on', true);
  update public.content_items set status = 'waiting_client', client_approval_status = 'pending',
    client_handoff_version_id = p_version_id, client_sent_at = null, client_sent_by = null,
    client_issues = null, revision_notes = null,
    next_action = 'Send approved content to the client through the external channel', updated_at = now()
  where id = item_row.id;
  for manager_id in select cm.user_id from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = item_row.organization_id and cm.client_id = item_row.client_id
      and cm.client_role = 'account_manager' and cm.removed_at is null
      and p.status = 'active' and p.deactivated_at is null
  loop
    perform private.enqueue_notification(item_row.organization_id, manager_id, 'submission_approved',
      'Ready for client approval: ' || item_row.title,
      'Internal review is approved. Send the content externally, then record the client response in Jota.',
      'content_item', item_row.id, '/content#content-item-' || item_row.id::text,
      'content-client-approval:' || p_version_id::text);
  end loop;
end;
$$;
revoke all on function private.queue_content_client_approval(uuid, uuid, uuid) from public, anon, authenticated;

-- A linked task approval approves the exact submitted assets for its content.
-- Preserve the original task version/review and create an immutable content snapshot
-- so the existing version-specific client/publication guards remain authoritative.
create or replace function private.queue_approved_task_content(p_content_id uuid, p_task_version_id uuid, p_actor_id uuid, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item_row public.content_items%rowtype;
  task_version public.submission_versions%rowtype;
  submission_row public.content_submissions%rowtype;
  new_version_id uuid;
  next_version integer;
begin
  select * into item_row from public.content_items where id = p_content_id and deleted_at is null for update;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Linked content is unavailable' using errcode = 'P0002';
  end if;
  if item_row.status in ('published', 'cancelled', 'rejected') then return; end if;
  if item_row.status = 'for_review' or (item_row.status = 'waiting_client' and item_row.client_approval_status = 'pending') then
    raise exception 'Finish the current content or client review before approving another linked task' using errcode = '22023';
  end if;
  select * into task_version from public.submission_versions where id = p_task_version_id and organization_id = item_row.organization_id;
  select * into submission_row from public.content_submissions where content_item_id = item_row.id and organization_id = item_row.organization_id for update;
  if not found then
    insert into public.content_submissions (organization_id, client_id, campaign_id, content_item_id,
      status, current_version_number, submitted_by, submitted_at, approved_at, content_status_before_review)
    values (item_row.organization_id, item_row.client_id, item_row.campaign_id, item_row.id,
      'approved', 1, task_version.submitted_by, task_version.submitted_at, now(), 'in_production')
    returning * into submission_row;
    next_version := 1;
  else
    next_version := submission_row.current_version_number + 1;
    update public.content_submissions set status = 'approved', current_version_number = next_version,
      submitted_by = task_version.submitted_by, submitted_at = task_version.submitted_at, approved_at = now(), updated_at = now()
    where id = submission_row.id;
  end if;
  insert into public.content_submission_versions (organization_id, submission_id, version_number, notes, submitted_by, submitted_at)
  values (item_row.organization_id, submission_row.id, next_version, task_version.notes, task_version.submitted_by, task_version.submitted_at)
  returning id into new_version_id;
  insert into public.content_submission_version_files (organization_id, submission_version_id, attachment_id)
  select organization_id, new_version_id, attachment_id from public.submission_version_files
  where submission_version_id = task_version.id and organization_id = item_row.organization_id;
  insert into public.content_reviews (organization_id, submission_version_id, reviewer_id, decision, comment)
  values (item_row.organization_id, new_version_id, p_actor_id, 'approved', p_comment);
  perform private.queue_content_client_approval(item_row.id, new_version_id, p_actor_id);
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (item_row.organization_id, p_actor_id, 'content_item', item_row.id, 'CONTENT_APPROVED_FROM_LINKED_TASK',
    jsonb_build_object('task_id', task_version.task_id, 'task_version_id', task_version.id, 'content_version_id', new_version_id));
end;
$$;
revoke all on function private.queue_approved_task_content(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.review_content_submission(
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
  submission_row public.content_submissions%rowtype;
  version_row public.content_submission_versions%rowtype;
  item_row public.content_items%rowtype;
  feedback text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.review') then raise exception 'Content review is not permitted' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'revision_requested') then raise exception 'Choose approve or request changes' using errcode = '22023'; end if;
  if p_decision = 'revision_requested' and feedback is null then raise exception 'Add feedback when requesting changes' using errcode = '22023'; end if;
  if char_length(coalesce(feedback, '')) > 5000 then raise exception 'Review feedback is too long' using errcode = '22023'; end if;

  -- Match client response lock order: content first, then its submission.
  perform ci.id from public.content_items ci
  join public.content_submissions s on s.content_item_id = ci.id and s.organization_id = ci.organization_id
  join public.content_submission_versions v on v.submission_id = s.id and v.organization_id = s.organization_id
  where v.id = p_submission_version_id and ci.organization_id = org_id for update of ci;

  select s.* into submission_row
  from public.content_submission_versions v
  join public.content_submissions s on s.organization_id = v.organization_id and s.id = v.submission_id
  where v.id = p_submission_version_id and v.organization_id = org_id
  for update of s;
  if not found then raise exception 'Submission version not found' using errcode = 'P0002'; end if;

  select * into version_row from public.content_submission_versions v
  where v.id = p_submission_version_id and v.organization_id = org_id;
  select * into item_row from public.content_items ci
  where ci.id = submission_row.content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  if submission_row.status <> 'submitted' or submission_row.current_version_number <> version_row.version_number then
    raise exception 'Only the latest pending version can be reviewed' using errcode = '22023';
  end if;
  if version_row.submitted_by = actor_id then raise exception 'You cannot review your own submission' using errcode = '42501'; end if;

  insert into public.content_reviews (organization_id, submission_version_id, reviewer_id, decision, comment)
  values (org_id, p_submission_version_id, actor_id, p_decision, feedback);
  update public.content_submissions set status = p_decision::text::public.submission_status,
    approved_at = case when p_decision = 'approved' then now() else null end, updated_at = now()
  where id = submission_row.id and organization_id = org_id;
  if p_decision = 'revision_requested' then
    update public.content_items set status = 'revision_requested', revision_notes = feedback,
      next_action = 'Address supervisor feedback and resubmit'
    where id = item_row.id and organization_id = org_id;
  else
    perform private.queue_content_client_approval(item_row.id, p_submission_version_id, actor_id);
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id,
    case when p_decision = 'approved' then 'CONTENT_REVIEW_APPROVED' else 'CONTENT_CHANGES_REQUESTED' end,
    jsonb_build_object('submission_id', submission_row.id, 'version_id', p_submission_version_id, 'decision', p_decision, 'comment', feedback));
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
  if p_decision is null or p_decision not in ('approved', 'revision_requested') then
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

  -- Client revisions lock content, tasks, then submissions. Use the same order.
  perform ci.id from public.content_items ci
  join public.tasks t on t.content_item_id = ci.id and t.organization_id = ci.organization_id
  join public.submission_versions v on v.task_id = t.id and v.organization_id = t.organization_id
  where v.id = p_submission_version_id and ci.organization_id = org_id for update of ci;
  perform t.id from public.tasks t join public.submission_versions v
    on v.task_id = t.id and v.organization_id = t.organization_id
  where v.id = p_submission_version_id and t.organization_id = org_id for update of t;

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

  if p_decision = 'approved' and task_row.content_item_id is not null then
    perform private.queue_approved_task_content(task_row.content_item_id, version_row.id, actor_id, feedback);
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_row.id,
    case when p_decision = 'approved' then 'TASK_REVIEW_APPROVED' else 'TASK_CHANGES_REQUESTED' end,
    jsonb_build_object('submission_id', submission_row.id, 'version_id', p_submission_version_id,
      'version_number', version_row.version_number, 'decision', p_decision, 'comment', feedback));
end;
$$;

create or replace function public.send_approved_content_to_client(p_content_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  approved_version_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('content.update') then
    raise exception 'Content editing is not permitted' using errcode = '42501';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if not private.can_handle_client_handoff(item_row.client_id) then
    raise exception 'Only an assigned Account Manager can record the client handoff' using errcode = '42501';
  end if;
  if item_row.status in ('for_review', 'revision_requested', 'published', 'cancelled', 'rejected')
    or (item_row.client_approval_status = 'pending' and item_row.client_sent_at is not null) then
    raise exception 'This content is not ready for a client handoff' using errcode = '22023';
  end if;

  select v.id into approved_version_id
  from public.content_submissions s
  join public.content_submission_versions v
    on v.organization_id = s.organization_id and v.submission_id = s.id
    and v.version_number = s.current_version_number
  join public.content_reviews r
    on r.organization_id = v.organization_id and r.submission_version_id = v.id
  where s.organization_id = org_id and s.content_item_id = item_row.id
    and s.status = 'approved' and r.decision = 'approved';

  if approved_version_id is null or (approved_version_id = item_row.client_handoff_version_id and item_row.client_sent_at is not null) then
    raise exception 'A newly approved content version is required before sending to the client' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('jota.client_handoff_write', 'on', true);
  perform pg_catalog.set_config('jota.external_client_decision_write', 'on', true);
  update public.content_items set status = 'waiting_client', client_approval_status = 'pending',
    client_issues = null, client_handoff_version_id = approved_version_id,
    client_sent_at = now(), client_sent_by = actor_id,
    next_action = 'Await client response through the external channel', updated_at = now()
  where id = item_row.id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id, 'CONTENT_SENT_TO_CLIENT',
    jsonb_build_object('version_id', approved_version_id, 'channel', 'external'));
end;
$$;

create or replace function public.record_external_client_decision(
  p_content_item_id uuid, p_decision text, p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  task_row public.tasks%rowtype;
  feedback text := nullif(trim(coalesce(p_feedback, '')), '');
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('content.update') then
    raise exception 'Content editing is not permitted' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'revision_requested', 'rejected')
    or char_length(coalesce(feedback, '')) > 5000
    or (p_decision = 'revision_requested' and feedback is null) then
    raise exception 'Choose a valid client decision and include feedback for a revision request' using errcode = '22023';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Content item not found' using errcode = 'P0002';
  end if;
  if not private.can_handle_client_handoff(item_row.client_id) then
    raise exception 'Only an assigned Account Manager can record the client response' using errcode = '42501';
  end if;
  if item_row.client_sent_at is null or item_row.client_handoff_version_id is null or item_row.status <> 'waiting_client'
    or item_row.client_approval_status is distinct from 'pending' then
    raise exception 'Send approved content to the client before recording a response' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('jota.external_client_decision_write', 'on', true);
  update public.content_items set
    status = case when p_decision = 'revision_requested' then 'revision_requested'::public.content_status
      when p_decision = 'rejected' then 'rejected'::public.content_status else status end,
    client_approval_status = p_decision,
    client_issues = case when p_decision in ('revision_requested', 'rejected') then feedback else null end,
    revision_count = revision_count + case when p_decision = 'revision_requested' then 1 else 0 end,
    next_action = case when p_decision = 'revision_requested' then 'Address client revisions'
      when p_decision = 'approved' then 'Schedule or publish the client-approved content'
      else 'Review the client rejection' end,
    updated_at = now()
  where id = item_row.id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id, 'CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED',
    jsonb_build_object('from', item_row.client_approval_status, 'to', p_decision,
      'feedback', feedback, 'decision_source', 'external_channel',
      'version_id', item_row.client_handoff_version_id));

  if p_decision = 'revision_requested' then
    for task_row in
      select t.* from public.tasks t
      where t.organization_id = org_id and t.content_item_id = item_row.id
        and t.deleted_at is null and t.archived_at is null and t.status <> 'cancelled'
      order by t.id for update
    loop
      if task_row.status is distinct from 'todo'::public.task_status or task_row.completed_at is not null then
        update public.tasks set status = 'todo', completed_at = null, updated_at = now()
        where id = task_row.id and organization_id = org_id;
        insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
        values (org_id, actor_id, 'task', task_row.id, 'TASK_RETURNED_FOR_CLIENT_REVISION',
          jsonb_build_object('from', task_row.status, 'to', 'todo', 'content_item_id', item_row.id, 'feedback', feedback));
      end if;
      update public.submissions set status = 'revision_requested', approved_at = null, updated_at = now()
      where organization_id = org_id and task_id = task_row.id
        and status in ('submitted', 'approved', 'revision_requested');
    end loop;
  end if;
end;
$$;

create or replace function public.schedule_client_approved_content(p_content_item_id uuid, p_publish_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
begin
  if actor_id is null or org_id is null or not private.has_permission('content.update') then
    raise exception 'Content editing is not permitted' using errcode = '42501';
  end if;
  select * into item_row from public.content_items where id = p_content_item_id and organization_id = org_id and deleted_at is null for update;
  if not found or not private.can_access_client(item_row.client_id) then raise exception 'Content not found' using errcode = 'P0002'; end if;
  if not private.can_handle_client_handoff(item_row.client_id) then raise exception 'Account Manager access is required' using errcode = '42501'; end if;
  if p_publish_at is null or not isfinite(p_publish_at) or p_publish_at <= now() then raise exception 'Choose a future posting date and time' using errcode = '22023'; end if;
  if item_row.status not in ('waiting_client', 'scheduled') or item_row.client_approval_status is distinct from 'approved' then
    raise exception 'Record client approval before scheduling' using errcode = '22023';
  end if;
  -- Existing publication trigger verifies approval belongs to the latest version.
  if not exists (select 1 from public.content_submissions s join public.content_submission_versions v
    on v.submission_id = s.id and v.organization_id = s.organization_id and v.version_number = s.current_version_number
    where s.content_item_id = item_row.id and s.organization_id = org_id and s.status = 'approved' and v.id = item_row.client_handoff_version_id) then
    raise exception 'Client approval is required for the latest version' using errcode = '22023';
  end if;
  update public.content_items set status = 'scheduled', publish_at = p_publish_at,
    next_action = 'Publish content at the scheduled posting time', updated_at = now()
  where id = item_row.id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id, 'CONTENT_POSTING_SCHEDULED',
    jsonb_build_object('publish_at', p_publish_at, 'version_id', item_row.client_handoff_version_id));
end;
$$;
revoke all on function public.schedule_client_approved_content(uuid, timestamptz) from public, anon;
grant execute on function public.schedule_client_approved_content(uuid, timestamptz) to authenticated;

create or replace function private.guard_linked_task_client_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status = 'approved' and new.content_item_id is not null
    and not exists (select 1 from public.content_items ci
      join public.content_submissions s on s.content_item_id = ci.id and s.organization_id = ci.organization_id
      join public.content_submission_versions v on v.submission_id = s.id and v.organization_id = s.organization_id
        and v.version_number = s.current_version_number
      where ci.id = new.content_item_id and ci.organization_id = new.organization_id
        and ci.client_approval_status = 'approved' and s.status = 'approved' and v.id = ci.client_handoff_version_id) then
    raise exception 'Record client approval on the linked content before completing this task' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_linked_task_client_completion() from public, anon, authenticated;
drop trigger if exists tasks_guard_client_completion on public.tasks;
create trigger tasks_guard_client_completion before update of status on public.tasks
for each row execute function private.guard_linked_task_client_completion();

commit;

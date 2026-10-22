begin;

-- A handoff records that the Account Manager sent the approved creative through
-- an external channel. It does not contact the client from Jota.
alter table public.content_items
  add column client_handoff_version_id uuid references public.content_submission_versions(id) on delete restrict,
  add column client_sent_at timestamptz,
  add column client_sent_by uuid;

alter table public.content_items
  add constraint content_items_client_sent_by_fk
  foreign key (organization_id, client_sent_by)
  references public.profiles(organization_id, id) on delete restrict;

create or replace function private.guard_content_client_handoff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'waiting_client' and old.status is distinct from new.status
    and pg_catalog.current_setting('jota.client_handoff_write', true) is distinct from 'on' then
    raise exception 'Use Send to client after internal approval' using errcode = '42501';
  end if;
  if (new.client_handoff_version_id is distinct from old.client_handoff_version_id
      or new.client_sent_at is distinct from old.client_sent_at
      or new.client_sent_by is distinct from old.client_sent_by)
    and pg_catalog.current_setting('jota.client_handoff_write', true) is distinct from 'on' then
    raise exception 'Client handoff details are workflow-managed' using errcode = '42501';
  end if;
  if old.status = 'waiting_client' and old.client_approval_status = 'pending'
    and old.client_handoff_version_id is not null and new.status is distinct from old.status
    and pg_catalog.current_setting('jota.external_client_decision_write', true) is distinct from 'on' then
    raise exception 'Record the client response before changing this status' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_content_client_handoff() from public, anon, authenticated;
create trigger content_items_guard_client_handoff
  before update on public.content_items
  for each row execute function private.guard_content_client_handoff();

-- Keep CSV import capable of preserving historical statuses. New manual items
-- cannot claim a current client handoff or response at creation time.
create or replace function public.create_content_tracker_item_for_current_user(
  p_client_id uuid, p_campaign_id uuid, p_title text, p_platform text,
  p_content_type text, p_description text, p_status public.content_status,
  p_work_date date, p_deadline_at date, p_publish_at timestamptz,
  p_client_approval_status text, p_client_issues text, p_notes text,
  p_next_action text, p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  new_content_id uuid;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.create') then raise exception 'Content creation is not permitted' using errcode = '42501'; end if;
  if not private.can_access_client(p_client_id) then raise exception 'Client access is not permitted' using errcode = '42501'; end if;
  if p_status = 'waiting_client' or p_client_approval_status is not null or p_client_issues is not null then
    raise exception 'New content cannot start in the client approval workflow' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.campaigns c where c.id = p_campaign_id and c.client_id = p_client_id
      and c.organization_id = org_id and c.deleted_at is null
  ) then raise exception 'Choose a campaign belonging to this client' using errcode = '22023'; end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = p_client_id and cm.user_id = p_assigned_to
      and cm.removed_at is null and p.status = 'active' and p.deactivated_at is null
  ) then raise exception 'Choose an active member assigned to this client' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 200
    or char_length(trim(coalesce(p_platform, ''))) not between 2 and 60
    or char_length(trim(coalesce(p_content_type, ''))) not between 2 and 80
    or char_length(coalesce(p_description, '')) > 5000
    or char_length(coalesce(p_notes, '')) > 5000
    or char_length(coalesce(p_next_action, '')) > 500
  then raise exception 'Invalid content details' using errcode = '22023'; end if;

  insert into public.content_items (
    organization_id, client_id, campaign_id, title, platform, content_type,
    description, status, work_date, deadline_at, publish_at,
    client_approval_status, client_issues, notes, next_action, assigned_to, created_by
  ) values (
    org_id, p_client_id, p_campaign_id, trim(p_title), trim(p_platform), trim(p_content_type),
    nullif(trim(coalesce(p_description, '')), ''), p_status, p_work_date, p_deadline_at, p_publish_at,
    null, null, nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_next_action, '')), ''), p_assigned_to, actor_id
  ) returning id into new_content_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', new_content_id, 'CONTENT_CREATED',
    jsonb_build_object('title', trim(p_title), 'status', p_status));
  return new_content_id;
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
  if not exists (
    select 1 from public.client_members cm
    where cm.organization_id = org_id and cm.client_id = item_row.client_id
      and cm.user_id = actor_id and cm.client_role = 'account_manager' and cm.removed_at is null
  ) then
    raise exception 'Only an assigned Account Manager can record the client handoff' using errcode = '42501';
  end if;
  if item_row.status in ('for_review', 'revision_requested', 'published', 'cancelled', 'rejected')
    or (item_row.client_approval_status = 'pending' and item_row.client_handoff_version_id is not null) then
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

  if approved_version_id is null or approved_version_id = item_row.client_handoff_version_id then
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

revoke all on function public.send_approved_content_to_client(uuid) from public, anon;
grant execute on function public.send_approved_content_to_client(uuid) to authenticated;

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
  if not exists (
    select 1 from public.client_members cm
    where cm.organization_id = org_id and cm.client_id = item_row.client_id
      and cm.user_id = actor_id and cm.client_role = 'account_manager' and cm.removed_at is null
  ) then
    raise exception 'Only an assigned Account Manager can record the client response' using errcode = '42501';
  end if;
  if item_row.client_handoff_version_id is null or item_row.status <> 'waiting_client'
    or item_row.client_approval_status <> 'pending' then
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

commit;

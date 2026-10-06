begin;

-- Profile names are visible to users who share an assigned task, but not to
-- unrelated employees. The security-definer access check avoids RLS recursion.
create policy profiles_read_task_collaborators on public.profiles for select to authenticated
  using (
    organization_id = (select private.current_organization_id())
    and exists (
      select 1
      from public.task_assignees viewer
      join public.task_assignees colleague
        on colleague.organization_id = viewer.organization_id
        and colleague.task_id = viewer.task_id
      where viewer.user_id = (select auth.uid())
        and viewer.removed_at is null
        and colleague.user_id = profiles.id
        and colleague.removed_at is null
        and private.can_access_task(viewer.task_id)
    )
  );

create or replace function public.workflow_create_task(
  p_title text,
  p_client_id uuid,
  p_campaign_name text,
  p_priority public.task_priority,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := private.current_organization_id();
  task_id uuid;
  matched_campaign_id uuid;
begin
  if org_id is null or (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.create') then
    raise exception 'Task creation is not permitted' using errcode = '42501';
  end if;
  if not private.can_access_client(p_client_id) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(p_title)) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;

  select c.id into matched_campaign_id
  from public.campaigns c
  where c.organization_id = org_id
    and c.client_id = p_client_id
    and lower(trim(c.name)) = lower(trim(coalesce(p_campaign_name, '')))
    and c.deleted_at is null
  limit 1;

  if nullif(trim(coalesce(p_campaign_name, '')), '') is null or matched_campaign_id is null then
    raise exception 'Choose an existing campaign for this client' using errcode = '22023';
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, title, status, priority, due_at, created_by
  ) values (
    org_id, p_client_id, matched_campaign_id, trim(p_title), 'todo', p_priority, p_due_at, (select auth.uid())
  ) returning id into task_id;

  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
  values (org_id, task_id, (select auth.uid()), true, (select auth.uid()));

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, (select auth.uid()), 'task', task_id, 'TASK_CREATED', jsonb_build_object('title', trim(p_title)));

  return task_id;
end;
$$;

create or replace function public.workflow_update_task_status(p_task_id uuid, p_status public.task_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := private.current_organization_id();
  current_task public.tasks%rowtype;
begin
  if org_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into current_task
  from public.tasks t
  where t.id = p_task_id and t.organization_id = org_id and t.deleted_at is null
  for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if private.has_permission('tasks.view_all') then
    if current_task.status <> 'approved' or p_status <> 'completed' then
      raise exception 'Supervisors can only complete approved tasks' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.task_assignees ta
      where ta.organization_id = org_id and ta.task_id = p_task_id
        and ta.user_id = (select auth.uid()) and ta.is_primary and ta.removed_at is null
    ) or current_task.status not in ('todo', 'in_progress', 'revision_requested')
      or p_status not in ('todo', 'in_progress') then
      raise exception 'Task status change is not permitted' using errcode = '42501';
    end if;
  end if;

  if current_task.status = p_status then return; end if;
  update public.tasks
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end
  where id = p_task_id and organization_id = org_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, (select auth.uid()), 'task', p_task_id, 'TASK_STATUS_CHANGED',
    jsonb_build_object('from', current_task.status, 'to', p_status));
end;
$$;

create or replace function public.workflow_add_task_comment(p_task_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := private.current_organization_id();
  comment_id uuid;
begin
  if org_id is null or not private.can_access_task(p_task_id) then
    raise exception 'Task access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(p_body)) not between 1 and 10000 then
    raise exception 'Comment must contain 1 to 10000 characters' using errcode = '22023';
  end if;

  insert into public.comments (organization_id, task_id, author_id, body)
  values (org_id, p_task_id, (select auth.uid()), trim(p_body))
  returning id into comment_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, (select auth.uid()), 'task', p_task_id, 'COMMENT_ADDED', jsonb_build_object('comment_id', comment_id));
  return comment_id;
end;
$$;

create or replace function public.workflow_toggle_checklist(p_task_id uuid, p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid := private.current_organization_id();
  item_completed boolean;
  current_status public.task_status;
begin
  if org_id is null or not private.can_access_task(p_task_id) then
    raise exception 'Task access is not permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.task_assignees ta
    where ta.organization_id = org_id and ta.task_id = p_task_id
      and ta.user_id = (select auth.uid()) and ta.is_primary and ta.removed_at is null
  ) then
    raise exception 'Only the primary owner can update this checklist' using errcode = '42501';
  end if;
  select t.status into current_status from public.tasks t where t.id = p_task_id and t.organization_id = org_id;
  if current_status not in ('todo', 'in_progress', 'revision_requested') then
    raise exception 'This task checklist is read-only' using errcode = '42501';
  end if;

  update public.task_checklist_items
  set is_completed = not is_completed,
      completed_by = case when not is_completed then (select auth.uid()) else null end,
      completed_at = case when not is_completed then now() else null end
  where id = p_item_id and task_id = p_task_id and organization_id = org_id
  returning is_completed into item_completed;
  if not found then raise exception 'Checklist item not found' using errcode = 'P0002'; end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, (select auth.uid()), 'task', p_task_id, 'CHECKLIST_UPDATED', jsonb_build_object('item_id', p_item_id, 'completed', item_completed));
  return item_completed;
end;
$$;

revoke all on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz) from public, anon;
revoke all on function public.workflow_update_task_status(uuid, public.task_status) from public, anon;
revoke all on function public.workflow_add_task_comment(uuid, text) from public, anon;
revoke all on function public.workflow_toggle_checklist(uuid, uuid) from public, anon;
grant execute on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz) to authenticated;
grant execute on function public.workflow_update_task_status(uuid, public.task_status) to authenticated;
grant execute on function public.workflow_add_task_comment(uuid, text) to authenticated;
grant execute on function public.workflow_toggle_checklist(uuid, uuid) to authenticated;

commit;

begin;

-- Supervisors and administrators can create work for themselves on any client
-- they can access. Assigning work to another person still requires that person
-- to be an active member of the selected client.
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
  if not private.can_access_client(p_client_id) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;

  if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
    raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_campaign_name, '')), '') is not null then
    select c.id into matched_campaign_id
    from public.campaigns c
    where c.organization_id = org_id
      and c.client_id = p_client_id
      and lower(trim(c.name)) = lower(trim(p_campaign_name))
      and c.deleted_at is null
    limit 1;
    if matched_campaign_id is null then
      raise exception 'Choose an active campaign belonging to this client' using errcode = '22023';
    end if;
  end if;

  if assignee_id is distinct from actor_id and not exists (
    select 1
    from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = p_client_id
      and cm.user_id = assignee_id and cm.removed_at is null
      and p.status = 'active' and p.deactivated_at is null
  ) then
    raise exception 'Choose an active member assigned to this client' using errcode = '22023';
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, title, status, priority, due_at, created_by
  ) values (
    org_id, p_client_id, matched_campaign_id, trim(p_title), 'todo', p_priority, p_due_at, actor_id
  ) returning id into task_id;

  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
  values (org_id, task_id, assignee_id, true, actor_id);

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_id, 'TASK_CREATED', jsonb_build_object(
    'title', trim(p_title), 'assigned_to', assignee_id, 'campaign_id', matched_campaign_id
  ));
  if assignee_id <> actor_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', task_id, 'TASK_ASSIGNED', jsonb_build_object('assigned_to', assignee_id));
  end if;

  return task_id;
end;
$$;

create or replace function public.workflow_create_task_for_content(
  p_content_item_id uuid,
  p_title text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  assignee_id uuid := coalesce(p_assigned_to, auth.uid());
  task_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'Active sign-in required' using errcode = '42501';
  end if;
  if not private.has_permission('tasks.create') then
    raise exception 'Task creation is not permitted' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 220 or p_due_at is null then
    raise exception 'A valid task title and due date are required' using errcode = '22023';
  end if;
  if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
    raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for share;
  if not found or not private.can_access_client(item_row.client_id) then
    raise exception 'Content item not found or unavailable' using errcode = 'P0002';
  end if;
  if item_row.status in ('published', 'cancelled', 'rejected') then
    raise exception 'Published, cancelled, or rejected content cannot receive new tasks' using errcode = '22023';
  end if;
  if assignee_id is distinct from actor_id and not exists (
    select 1 from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = item_row.client_id
      and cm.user_id = assignee_id and cm.removed_at is null
      and p.status = 'active' and p.deactivated_at is null
  ) then
    raise exception 'Choose an active member assigned to this client' using errcode = '22023';
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, content_item_id, title,
    status, priority, due_at, created_by
  ) values (
    org_id, item_row.client_id, item_row.campaign_id, item_row.id, trim(p_title),
    'todo', p_priority, p_due_at, actor_id
  ) returning id into task_id;

  insert into public.task_assignees (organization_id, task_id, user_id, is_primary, assigned_by)
  values (org_id, task_id, assignee_id, true, actor_id);

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'task', task_id, 'TASK_CREATED_FROM_CONTENT', jsonb_build_object(
    'title', trim(p_title), 'assigned_to', assignee_id,
    'content_item_id', item_row.id, 'campaign_id', item_row.campaign_id
  ));
  if assignee_id <> actor_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values (org_id, actor_id, 'task', task_id, 'TASK_ASSIGNED', jsonb_build_object('assigned_to', assignee_id));
  end if;

  return task_id;
end;
$$;

revoke all on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) from public, anon;
grant execute on function public.workflow_create_task(text, uuid, text, public.task_priority, timestamptz, uuid) to authenticated;
revoke all on function public.workflow_create_task_for_content(uuid, text, public.task_priority, timestamptz, uuid) from public, anon;
grant execute on function public.workflow_create_task_for_content(uuid, text, public.task_priority, timestamptz, uuid) to authenticated;

commit;

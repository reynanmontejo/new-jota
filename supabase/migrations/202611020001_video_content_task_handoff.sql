begin;

-- A linked video task belongs to the client's designated video editor. This
-- narrow exception lets an account manager hand off video work without giving
-- them the organization-wide tasks.assign permission.
create or replace function public.workflow_create_task_for_content_with_details(
  p_content_item_id uuid,
  p_title text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_assigned_to uuid,
  p_description text,
  p_start_at timestamptz,
  p_checklist text[]
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
  designated_editor_id uuid;
  task_id uuid;
  checklist_item text;
  checklist_position integer;
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
  if char_length(coalesce(p_description, '')) > 5000
    or (p_start_at is not null and p_start_at > p_due_at)
    or coalesce(array_length(p_checklist, 1), 0) > 20
    or exists (select 1 from unnest(coalesce(p_checklist, array[]::text[])) as entry(value)
      where entry.value is null or char_length(trim(entry.value)) not between 1 and 240) then
    raise exception 'Check the task brief, dates, and checklist' using errcode = '22023';
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

  if item_row.content_category = 'video' then
    select cm.user_id into designated_editor_id
    from public.client_members cm
    join public.profiles p on p.id = cm.user_id and p.organization_id = cm.organization_id
    where cm.organization_id = org_id and cm.client_id = item_row.client_id
      and cm.client_role = 'video_editor' and cm.removed_at is null
      and p.status = 'active' and p.deactivated_at is null
    order by cm.assigned_at desc, cm.user_id
    limit 1;
    if designated_editor_id is null then
      raise exception 'Assign an active Video Editor to this client before creating a video task' using errcode = '22023';
    end if;
    if assignee_id is distinct from designated_editor_id then
      raise exception 'Video tasks must be assigned to this client''s Video Editor' using errcode = '22023';
    end if;
  else
    if assignee_id is distinct from actor_id and not private.has_permission('tasks.assign') then
      raise exception 'Assigning tasks to another person is not permitted' using errcode = '42501';
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
  end if;

  insert into public.tasks (
    organization_id, client_id, campaign_id, content_item_id, title, description,
    status, priority, start_at, due_at, created_by
  ) values (
    org_id, item_row.client_id, item_row.campaign_id, item_row.id, trim(p_title), nullif(trim(p_description), ''),
    'todo', p_priority, p_start_at, p_due_at, actor_id
  ) returning id into task_id;

  for checklist_position in 1..coalesce(array_length(p_checklist, 1), 0) loop
    checklist_item := trim(p_checklist[checklist_position]);
    insert into public.task_checklist_items (organization_id, task_id, title, position)
    values (org_id, task_id, checklist_item, checklist_position - 1);
  end loop;

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

-- Keep the existing five-argument RPC available while app versions overlap.
create or replace function public.workflow_create_task_for_content(
  p_content_item_id uuid,
  p_title text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_assigned_to uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.workflow_create_task_for_content_with_details(
    p_content_item_id, p_title, p_priority, p_due_at, p_assigned_to,
    null::text, null::timestamptz, array[]::text[]
  )
$$;

revoke all on function public.workflow_create_task_for_content_with_details(uuid, text, public.task_priority, timestamptz, uuid, text, timestamptz, text[]) from public, anon;
grant execute on function public.workflow_create_task_for_content_with_details(uuid, text, public.task_priority, timestamptz, uuid, text, timestamptz, text[]) to authenticated;
revoke all on function public.workflow_create_task_for_content(uuid, text, public.task_priority, timestamptz, uuid) from public, anon;
grant execute on function public.workflow_create_task_for_content(uuid, text, public.task_priority, timestamptz, uuid) to authenticated;

commit;

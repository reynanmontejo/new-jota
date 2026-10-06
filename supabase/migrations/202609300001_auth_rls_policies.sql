begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid())
    and p.status = 'active'
    and p.deactivated_at is null
    and o.is_active
    and o.deleted_at is null
  limit 1
$$;

create or replace function private.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.organization_id = ur.organization_id
    join public.organizations o on o.id = ur.organization_id
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.organization_id = ur.organization_id
    where ur.user_id = (select auth.uid())
      and ur.organization_id = private.current_organization_id()
      and rp.permission_code = $1
      and p.status = 'active'
      and p.deactivated_at is null
      and o.is_active
      and o.deleted_at is null
  )
$$;

create or replace function private.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = $1
      and c.organization_id = private.current_organization_id()
      and c.deleted_at is null
      and (private.has_permission('clients.view_all') or exists (
        select 1 from public.client_members cm
        where cm.client_id = c.id and cm.organization_id = c.organization_id
          and cm.user_id = (select auth.uid()) and cm.removed_at is null
      ))
  )
$$;

create or replace function private.can_access_campaign(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = $1 and c.organization_id = private.current_organization_id() and c.deleted_at is null
      and (private.can_access_client(c.client_id) or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = c.id and cm.organization_id = c.organization_id
          and cm.user_id = (select auth.uid()) and cm.removed_at is null
      ))
  )
$$;

create or replace function private.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = $1 and t.organization_id = private.current_organization_id() and t.deleted_at is null
      and (private.has_permission('tasks.view_all') or t.created_by = (select auth.uid()) or exists (
        select 1 from public.task_assignees ta
        where ta.task_id = t.id and ta.organization_id = t.organization_id
          and ta.user_id = (select auth.uid()) and ta.removed_at is null
      ))
  )
$$;

create or replace function private.can_access_meeting(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = $1 and m.organization_id = private.current_organization_id()
      and (m.requested_by = (select auth.uid())
        or (m.client_id is not null and private.can_access_client(m.client_id))
        or exists (
          select 1 from public.meeting_participants mp
          where mp.meeting_id = m.id and mp.organization_id = m.organization_id
            and mp.user_id = (select auth.uid())
        ))
  )
$$;

create or replace function private.can_read_activity(entity_type text, entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case $1
    when 'task' then private.can_access_task($2)
    when 'client' then private.can_access_client($2)
    when 'campaign' then private.can_access_campaign($2)
    when 'meeting' then private.can_access_meeting($2)
    when 'content_item' then exists (
      select 1 from public.content_items ci
      where ci.id = $2 and ci.organization_id = private.current_organization_id()
        and ci.deleted_at is null and private.can_access_client(ci.client_id)
    )
    else false
  end
$$;

revoke all on function private.current_organization_id() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.can_access_client(uuid) from public, anon;
revoke all on function private.can_access_campaign(uuid) from public, anon;
revoke all on function private.can_access_task(uuid) from public, anon;
revoke all on function private.can_access_meeting(uuid) from public, anon;
revoke all on function private.can_read_activity(text, uuid) from public, anon;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.can_access_client(uuid) to authenticated;
grant execute on function private.can_access_campaign(uuid) to authenticated;
grant execute on function private.can_access_task(uuid) to authenticated;
grant execute on function private.can_access_meeting(uuid) to authenticated;
grant execute on function private.can_read_activity(text, uuid) to authenticated;

insert into public.permissions (code, description)
values ('tasks.view_all', 'View all tasks in the organization')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'tasks.view_all'
from public.roles r
where r.code in ('supervisor', 'administrator')
on conflict do nothing;

-- The app has read-only workflow data in this phase. Mutations are denied until
-- the validated workflow RPCs/server actions are introduced in the next phase.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

create policy organizations_read_own on public.organizations for select to authenticated
  using (id = (select private.current_organization_id()));
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (organization_id = (select private.current_organization_id())
    and (select private.has_permission('employees.view'))));
create policy permissions_read_active_org on public.permissions for select to authenticated
  using ((select private.current_organization_id()) is not null);
create policy roles_read_org on public.roles for select to authenticated
  using (organization_id = (select private.current_organization_id()));
create policy role_permissions_read_org on public.role_permissions for select to authenticated
  using (organization_id = (select private.current_organization_id()));
create policy user_roles_read_self_or_admin on public.user_roles for select to authenticated
  using (organization_id = (select private.current_organization_id())
    and (user_id = (select auth.uid()) or (select private.has_permission('employees.view'))));
create policy teams_read_org on public.teams for select to authenticated
  using (organization_id = (select private.current_organization_id()) and deleted_at is null
    and (select private.has_permission('employees.view')));
create policy team_members_read_team_scope on public.team_members for select to authenticated
  using (organization_id = (select private.current_organization_id())
    and (user_id = (select auth.uid()) or (select private.has_permission('employees.view'))));
create policy clients_read_assigned_or_all on public.clients for select to authenticated
  using (private.can_access_client(id));
create policy client_members_read_client_scope on public.client_members for select to authenticated
  using (organization_id = (select private.current_organization_id())
    and (user_id = (select auth.uid()) or (select private.has_permission('employees.view')) or private.can_access_client(client_id)));
create policy campaigns_read_client_scope on public.campaigns for select to authenticated
  using (private.can_access_campaign(id));
create policy campaign_members_read_campaign_scope on public.campaign_members for select to authenticated
  using (organization_id = (select private.current_organization_id())
    and (user_id = (select auth.uid()) or private.can_access_campaign(campaign_id)));
create policy content_items_read_client_scope on public.content_items for select to authenticated
  using (organization_id = (select private.current_organization_id()) and deleted_at is null and private.can_access_campaign(campaign_id));
create policy tasks_read_assigned_or_all on public.tasks for select to authenticated
  using (private.can_access_task(id));
create policy task_assignees_read_task_scope on public.task_assignees for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_task(task_id));
create policy task_checklist_read_task_scope on public.task_checklist_items for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_task(task_id));
create policy comments_read_task_scope on public.comments for select to authenticated
  using (organization_id = (select private.current_organization_id()) and deleted_at is null and private.can_access_task(task_id));
create policy attachments_read_entity_scope on public.attachments for select to authenticated
  using (organization_id = (select private.current_organization_id()) and deleted_at is null
    and case when task_id is not null then private.can_access_task(task_id) else private.can_access_client(client_id) end);
create policy submissions_read_task_scope on public.submissions for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_task(task_id));
create policy submission_versions_read_task_scope on public.submission_versions for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_task(task_id));
create policy submission_version_files_read_task_scope on public.submission_version_files for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_task(task_id));
create policy reviews_read_task_scope on public.reviews for select to authenticated
  using (organization_id = (select private.current_organization_id()) and exists (
    select 1 from public.submission_versions sv where sv.id = submission_version_id and private.can_access_task(sv.task_id)
  ));
create policy tools_read_active_org on public.tools for select to authenticated
  using ((select private.current_organization_id()) is not null);
create policy organization_tools_read_enabled on public.organization_tools for select to authenticated
  using (organization_id = (select private.current_organization_id()) and is_enabled);
create policy user_tools_read_own on public.user_tools for select to authenticated
  using (organization_id = (select private.current_organization_id()) and user_id = (select auth.uid()));
create policy meetings_read_participant_or_client on public.meetings for select to authenticated
  using (private.can_access_meeting(id));
create policy meeting_participants_read_meeting_scope on public.meeting_participants for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_meeting(meeting_id));
create policy notifications_read_own on public.notifications for select to authenticated
  using (organization_id = (select private.current_organization_id()) and recipient_id = (select auth.uid()));
create policy activity_logs_read_visible_entity on public.activity_logs for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_read_activity(entity_type, entity_id));

commit;

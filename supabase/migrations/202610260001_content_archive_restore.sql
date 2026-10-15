begin;

drop policy if exists content_items_read_client_scope on public.content_items;
create policy content_items_read_client_scope on public.content_items for select to authenticated
  using (
    organization_id = (select private.current_organization_id())
    and private.can_access_campaign(campaign_id)
    and (deleted_at is null or private.has_permission('content.update'))
  );

create index if not exists content_items_archived_idx
  on public.content_items (organization_id, deleted_at desc)
  where deleted_at is not null;

create or replace function public.restore_content_item_for_current_user(p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  target_client uuid;
begin
  if actor_id is null or org_id is null or not private.has_permission('content.update') then
    raise exception 'Content restore is not permitted' using errcode = '42501';
  end if;

  select client_id into target_client
  from public.content_items
  where id = p_content_id and organization_id = org_id and deleted_at is not null
  for update;

  if not found or not private.can_access_client(target_client) then
    raise exception 'Archived content item not found' using errcode = 'P0002';
  end if;

  update public.content_items
  set deleted_at = null
  where id = p_content_id and organization_id = org_id and deleted_at is not null;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
  values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_RESTORED');
end;
$$;

revoke all on function public.restore_content_item_for_current_user(uuid) from public, anon;
grant execute on function public.restore_content_item_for_current_user(uuid) to authenticated;

commit;

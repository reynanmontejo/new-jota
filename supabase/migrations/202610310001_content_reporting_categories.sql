begin;

-- The original content_type remains the human-readable subtype (Reel, carousel,
-- etc.). Ambiguous historical values are deliberately reported as Other.
alter table public.content_items
  add column content_category text not null default 'other'
    check (content_category in ('static', 'video', 'other')),
  add column content_category_manual boolean not null default false;

create or replace function private.infer_content_category(p_content_type text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  format_text text := lower(trim(coalesce(p_content_type, '')));
  video_match boolean;
  static_match boolean;
begin
  video_match := format_text ~ '(^|[^a-z0-9])(video|videos|reel|reels|shorts|clip|clips|animation|animated|motion|vlog|vlogs|film|films)([^a-z0-9]|$)';
  static_match := format_text ~ '(^|[^a-z0-9])(static|image|images|photo|photos|graphic|graphics|carousel|carousels|infographic|infographics|poster|posters)([^a-z0-9]|$)';
  if video_match and not static_match then return 'video'; end if;
  if static_match and not video_match then return 'static'; end if;
  return 'other';
end;
$$;

revoke all on function private.infer_content_category(text) from public, anon, authenticated;

update public.content_items
set content_category = private.infer_content_category(content_type);

create or replace function private.sync_content_category_from_format()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.content_category := private.infer_content_category(new.content_type);
    new.content_category_manual := false;
  elsif new.content_type is distinct from old.content_type then
    new.content_category := private.infer_content_category(new.content_type);
    new.content_category_manual := false;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_content_category_from_format() from public, anon, authenticated;
create trigger content_items_sync_category
  before insert or update of content_type on public.content_items
  for each row execute function private.sync_content_category_from_format();

-- A member with content-edit permission can correct an ambiguous category.
-- Passing 'auto' reapplies the conservative format classifier.
create or replace function public.set_content_category_for_current_user(p_content_id uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  item_row public.content_items%rowtype;
  resolved_category text;
begin
  if actor_id is null or org_id is null or not private.has_permission('content.update') then
    raise exception 'Content editing is not permitted' using errcode = '42501';
  end if;
  if p_category not in ('auto', 'static', 'video', 'other') or p_category is null then
    raise exception 'Choose a valid content category' using errcode = '22023';
  end if;
  select * into item_row from public.content_items
  where id = p_content_id and organization_id = org_id and deleted_at is null
  for update;
  if not found then raise exception 'Content not found' using errcode = 'P0002'; end if;
  if not private.can_access_client(item_row.client_id) then
    raise exception 'Client access is not permitted' using errcode = '42501';
  end if;

  resolved_category := case when p_category = 'auto'
    then private.infer_content_category(item_row.content_type) else p_category end;
  update public.content_items
  set content_category = resolved_category,
      content_category_manual = p_category <> 'auto'
  where id = p_content_id;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', p_content_id, 'CONTENT_CATEGORY_UPDATED',
    jsonb_build_object('category', resolved_category, 'manual', p_category <> 'auto'));
end;
$$;

revoke all on function public.set_content_category_for_current_user(uuid, text) from public, anon;
grant execute on function public.set_content_category_for_current_user(uuid, text) to authenticated;

commit;

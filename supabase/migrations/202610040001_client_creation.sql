begin;

-- Create clients only through this permission-checked RPC. The table is
-- intentionally read-only to clients; authorization and tenant ownership are
-- derived from the authenticated profile, never from caller-supplied IDs.
create or replace function public.create_client_for_current_user(
  p_name text,
  p_slug text,
  p_description text default null,
  p_website_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  client_id uuid;
begin
  if actor_id is null or org_id is null then
    raise exception 'An active authenticated workspace is required';
  end if;
  if not private.has_permission('clients.manage') then
    raise exception 'You do not have permission to create clients';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 140
    or char_length(trim(coalesce(p_slug, ''))) not between 1 and 160
    or trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(coalesce(trim(p_description), '')) > 2000
    or char_length(coalesce(trim(p_website_url), '')) > 2048
    or (nullif(trim(coalesce(p_website_url, '')), '') is not null
      and trim(p_website_url) !~ '^https://[^[:space:]]+$')
  then
    raise exception 'Invalid client details';
  end if;

  insert into public.clients (organization_id, name, slug, description, website_url, created_by)
  values (
    org_id,
    trim(p_name),
    lower(trim(p_slug)),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_website_url, '')), ''),
    actor_id
  )
  returning id into client_id;

  return client_id;
end;
$$;

revoke all on function public.create_client_for_current_user(text, text, text, text) from public, anon;
grant execute on function public.create_client_for_current_user(text, text, text, text) to authenticated;

commit;

begin;

-- Historical CSV rows may already be scheduled or published without a Jota
-- client-response record. Preserve those rows, but require an approved
-- external client decision for every new manual scheduling/publishing change.
create or replace function private.guard_content_publication_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('scheduled', 'published') then return new; end if;

  if tg_op = 'INSERT' then
    if pg_catalog.current_setting('jota.historical_content_import', true) = 'on' then
      return new;
    end if;
  elsif new.status is not distinct from old.status
    and new.client_approval_status is not distinct from old.client_approval_status then
    -- Allow edits to unchanged historical rows; do not silently rewrite them.
    return new;
  end if;

  if new.client_approval_status is distinct from 'approved'
    or new.client_handoff_version_id is null
    or not exists (
      select 1 from public.content_submissions s
      join public.content_submission_versions v
        on v.organization_id = s.organization_id and v.submission_id = s.id
        and v.version_number = s.current_version_number
      where s.organization_id = new.organization_id and s.content_item_id = new.id
        and s.status = 'approved' and v.id = new.client_handoff_version_id
    ) then
    raise exception 'Client approval is required before scheduling or publishing content'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_content_publication_approval() from public, anon, authenticated;
create trigger content_items_guard_publication_approval
  before insert or update of status, client_approval_status on public.content_items
  for each row execute function private.guard_content_publication_approval();

-- Keep the existing, validated importer intact. Move its implementation out
-- of the exposed API schema and grant only this wrapper the historical bypass.
alter function public.import_content_items_for_current_user(jsonb) set schema private;
revoke all on function private.import_content_items_for_current_user(jsonb) from public, anon, authenticated;

create function public.import_content_items_for_current_user(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_setting text := pg_catalog.current_setting('jota.historical_content_import', true);
  result jsonb;
begin
  perform pg_catalog.set_config('jota.historical_content_import', 'on', true);
  begin
    result := private.import_content_items_for_current_user(p_rows);
  exception when others then
    perform pg_catalog.set_config('jota.historical_content_import', coalesce(prior_setting, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('jota.historical_content_import', coalesce(prior_setting, ''), true);
  return result;
end;
$$;

revoke all on function public.import_content_items_for_current_user(jsonb) from public, anon;
grant execute on function public.import_content_items_for_current_user(jsonb) to authenticated;

commit;

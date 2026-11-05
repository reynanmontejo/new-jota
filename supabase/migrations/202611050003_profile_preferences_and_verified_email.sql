begin;

-- Additive: existing profile/photo RPCs and older app releases keep working.
-- Rollback: roll the app back first, then remove the trigger and new RPC.
-- Retain timezone data until no release reads it; no existing values are rewritten.
-- After reverting the app, rollback DDL (retain the column/data):
-- drop trigger if exists jota_sync_verified_profile_email on auth.users;
-- drop function if exists private.sync_verified_profile_email();
-- drop function if exists public.update_own_profile_preferences(text, text, text);
alter table public.profiles add column if not exists timezone text;

create or replace function public.update_own_profile_preferences(
  p_display_name text, p_job_title text, p_timezone text
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or private.current_organization_id() is null then
    raise exception 'Active workspace membership required' using errcode = '42501';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 2 and 120
    or char_length(coalesce(trim(p_job_title), '')) > 120
    or p_timezone is null or char_length(p_timezone) not between 1 and 80
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
  then raise exception 'Invalid profile preferences' using errcode = '22023'; end if;

  update public.profiles set display_name = trim(p_display_name),
    job_title = nullif(trim(coalesce(p_job_title, '')), ''), timezone = p_timezone, updated_at = now()
  where id = actor_id and status = 'active' and deactivated_at is null;
  if not found then raise exception 'Active profile not found' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.update_own_profile_preferences(text, text, text) from public, anon;
grant execute on function public.update_own_profile_preferences(text, text, text) to authenticated;

-- Only Auth's confirmed address is copied. Pending email_change values and
-- user-editable metadata are never treated as the delivery/login address.
create or replace function private.sync_verified_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email_confirmed_at is not null
    and nullif(trim(new.email), '') is not null then
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_verified_profile_email() from public, anon, authenticated;
drop trigger if exists jota_sync_verified_profile_email on auth.users;
create trigger jota_sync_verified_profile_email after update of email on auth.users
for each row execute function private.sync_verified_profile_email();

commit;

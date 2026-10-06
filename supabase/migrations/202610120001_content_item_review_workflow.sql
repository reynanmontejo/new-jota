begin;

-- Keep content reviews attached to the content row. Do not create a generic
-- task just to reuse task submissions; tasks remain a separate work domain.
alter table public.attachments
  add column if not exists content_item_id uuid;

alter table public.attachments
  add constraint attachments_content_item_fk
  foreign key (organization_id, client_id, campaign_id, content_item_id)
  references public.content_items (organization_id, client_id, campaign_id, id)
  on delete restrict;

create index if not exists attachments_content_item_created_idx
  on public.attachments (content_item_id, created_at desc)
  where deleted_at is null and content_item_id is not null;

create table public.content_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  campaign_id uuid not null,
  content_item_id uuid not null,
  status public.submission_status not null default 'draft',
  current_version_number integer not null default 0 check (current_version_number >= 0),
  content_status_before_review public.content_status not null default 'in_production',
  submitted_by uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, content_item_id),
  foreign key (organization_id, client_id, campaign_id, content_item_id)
    references public.content_items (organization_id, client_id, campaign_id, id) on delete cascade,
  foreign key (organization_id, submitted_by)
    references public.profiles (organization_id, id) on delete restrict,
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)),
  check ((status = 'approved') = (approved_at is not null))
);

create index content_submissions_review_queue_idx
  on public.content_submissions (organization_id, submitted_at)
  where status = 'submitted';

create table public.content_submission_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_id uuid not null,
  version_number integer not null check (version_number > 0),
  notes text,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (submission_id, version_number),
  foreign key (organization_id, submission_id)
    references public.content_submissions (organization_id, id) on delete cascade,
  foreign key (organization_id, submitted_by)
    references public.profiles (organization_id, id) on delete restrict,
  check (notes is null or char_length(notes) <= 5000)
);

create table public.content_submission_version_files (
  organization_id uuid not null,
  submission_version_id uuid not null,
  attachment_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (submission_version_id, attachment_id),
  foreign key (organization_id, submission_version_id)
    references public.content_submission_versions (organization_id, id) on delete cascade,
  foreign key (organization_id, attachment_id)
    references public.attachments (organization_id, id) on delete restrict
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  submission_version_id uuid not null,
  reviewer_id uuid not null,
  decision public.review_decision not null,
  comment text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (submission_version_id),
  foreign key (organization_id, submission_version_id)
    references public.content_submission_versions (organization_id, id) on delete restrict,
  foreign key (organization_id, reviewer_id)
    references public.profiles (organization_id, id) on delete restrict,
  check (decision <> 'revision_requested' or char_length(trim(comment)) > 0),
  check (comment is null or char_length(comment) <= 5000)
);

alter table public.content_submissions enable row level security;
alter table public.content_submission_versions enable row level security;
alter table public.content_submission_version_files enable row level security;
alter table public.content_reviews enable row level security;
revoke all on public.content_submissions, public.content_submission_versions,
  public.content_submission_version_files, public.content_reviews from public, anon;
grant select on public.content_submissions, public.content_submission_versions,
  public.content_submission_version_files, public.content_reviews to authenticated;

create policy content_submissions_read_client_scope on public.content_submissions for select to authenticated
  using (organization_id = (select private.current_organization_id()) and private.can_access_client(client_id));
create policy content_submission_versions_read_client_scope on public.content_submission_versions for select to authenticated
  using (organization_id = (select private.current_organization_id()) and exists (
    select 1 from public.content_submissions s
    where s.organization_id = content_submission_versions.organization_id
      and s.id = content_submission_versions.submission_id
      and private.can_access_client(s.client_id)
  ));
create policy content_submission_files_read_client_scope on public.content_submission_version_files for select to authenticated
  using (organization_id = (select private.current_organization_id()) and exists (
    select 1 from public.content_submission_versions v
    join public.content_submissions s on s.organization_id = v.organization_id and s.id = v.submission_id
    where v.organization_id = content_submission_version_files.organization_id
      and v.id = content_submission_version_files.submission_version_id
      and private.can_access_client(s.client_id)
  ));
create policy content_reviews_read_client_scope on public.content_reviews for select to authenticated
  using (organization_id = (select private.current_organization_id()) and exists (
    select 1 from public.content_submission_versions v
    join public.content_submissions s on s.organization_id = v.organization_id and s.id = v.submission_id
    where v.organization_id = content_reviews.organization_id
      and v.id = content_reviews.submission_version_id
      and private.can_access_client(s.client_id)
  ));

create trigger content_submission_versions_are_immutable
  before update or delete on public.content_submission_versions
  for each row execute function public.prevent_immutable_record_changes();
create trigger content_submission_version_files_are_immutable
  before update or delete on public.content_submission_version_files
  for each row execute function public.prevent_immutable_record_changes();
create trigger content_reviews_are_immutable
  before update or delete on public.content_reviews
  for each row execute function public.prevent_immutable_record_changes();

insert into public.permissions (code, description) values
  ('content.submit', 'Submit content files for supervisor review'),
  ('content.review', 'Review submitted content and request changes or approve')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, p.permission_code
from public.roles r
cross join (values ('content.submit'), ('content.review')) as p(permission_code)
where lower(r.code::text) in ('supervisor', 'administrator')
on conflict do nothing;

insert into public.role_permissions (organization_id, role_id, permission_code)
select r.organization_id, r.id, 'content.submit'
from public.roles r
where lower(r.code::text) = 'account_manager'
on conflict do nothing;

create or replace function public.submit_content_for_review(
  p_content_item_id uuid,
  p_attachment_ids uuid[],
  p_notes text default null
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
  submission_row public.content_submissions%rowtype;
  next_version integer;
  matched_files integer;
  new_files integer;
  version_id uuid;
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.submit') then raise exception 'Content submission is not permitted' using errcode = '42501'; end if;
  if coalesce(cardinality(p_attachment_ids), 0) not between 1 and 30
    or char_length(coalesce(p_notes, '')) > 5000 then
    raise exception 'Choose 1 to 30 files and keep notes under 5,000 characters' using errcode = '22023';
  end if;

  select * into item_row from public.content_items ci
  where ci.id = p_content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  if item_row.status in ('published', 'cancelled') then raise exception 'Published or cancelled content cannot be submitted' using errcode = '22023'; end if;

  select count(*) into matched_files from public.attachments a
  where a.organization_id = org_id and a.client_id = item_row.client_id and a.campaign_id = item_row.campaign_id
    and a.content_item_id = item_row.id and a.deleted_at is null and a.id = any(p_attachment_ids);
  if matched_files <> cardinality(p_attachment_ids) then raise exception 'One or more selected files are unavailable for this content item' using errcode = '22023'; end if;

  select * into submission_row from public.content_submissions s
  where s.organization_id = org_id and s.content_item_id = item_row.id
  for update;
  if found and submission_row.status = 'submitted' then raise exception 'This content item is already awaiting review' using errcode = '22023'; end if;
  if found and submission_row.status = 'revision_requested' then
    select count(*) into new_files from public.attachments a
    where a.organization_id = org_id and a.content_item_id = item_row.id and a.deleted_at is null
      and a.id = any(p_attachment_ids)
      and a.created_at > (select max(v.submitted_at) from public.content_submission_versions v where v.submission_id = submission_row.id);
    if new_files = 0 then raise exception 'Upload at least one new or updated file before resubmitting' using errcode = '22023'; end if;
  end if;

  if not found then
    insert into public.content_submissions (
      organization_id, client_id, campaign_id, content_item_id, status,
      current_version_number, content_status_before_review, submitted_by, submitted_at
    ) values (
      org_id, item_row.client_id, item_row.campaign_id, item_row.id, 'submitted',
      1, case when item_row.status in ('for_review', 'revision_requested') then 'in_production'::public.content_status else item_row.status end,
      actor_id, now()
    ) returning * into submission_row;
    next_version := 1;
  else
    next_version := submission_row.current_version_number + 1;
    update public.content_submissions set status = 'submitted', current_version_number = next_version,
      submitted_by = actor_id, submitted_at = now(), approved_at = null,
      content_status_before_review = case when submission_row.status = 'approved'
        then case when item_row.status in ('for_review', 'revision_requested') then 'in_production'::public.content_status else item_row.status end
        else submission_row.content_status_before_review end,
      updated_at = now()
    where id = submission_row.id returning * into submission_row;
  end if;

  insert into public.content_submission_versions (organization_id, submission_id, version_number, notes, submitted_by)
  values (org_id, submission_row.id, next_version, nullif(trim(coalesce(p_notes, '')), ''), actor_id)
  returning id into version_id;
  insert into public.content_submission_version_files (organization_id, submission_version_id, attachment_id)
  select org_id, version_id, selected.selected_id from unnest(p_attachment_ids) as selected(selected_id);

  update public.content_items set status = 'for_review', next_action = 'Awaiting supervisor review', revision_notes = null
  where id = item_row.id and organization_id = org_id;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id, 'CONTENT_SUBMITTED_FOR_REVIEW',
    jsonb_build_object('submission_id', submission_row.id, 'version_id', version_id, 'version_number', next_version, 'file_count', cardinality(p_attachment_ids)));
  return version_id;
end;
$$;

create or replace function public.review_content_submission(
  p_submission_version_id uuid,
  p_decision public.review_decision,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  org_id uuid := private.current_organization_id();
  submission_row public.content_submissions%rowtype;
  version_row public.content_submission_versions%rowtype;
  item_row public.content_items%rowtype;
  feedback text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if actor_id is null or org_id is null then raise exception 'Active sign-in required' using errcode = '42501'; end if;
  if not private.has_permission('content.review') then raise exception 'Content review is not permitted' using errcode = '42501'; end if;
  if p_decision = 'revision_requested' and feedback is null then raise exception 'Add feedback when requesting changes' using errcode = '22023'; end if;
  if char_length(coalesce(feedback, '')) > 5000 then raise exception 'Review feedback is too long' using errcode = '22023'; end if;

  select s.* into submission_row
  from public.content_submission_versions v
  join public.content_submissions s on s.organization_id = v.organization_id and s.id = v.submission_id
  where v.id = p_submission_version_id and v.organization_id = org_id
  for update of s;
  if not found then raise exception 'Submission version not found' using errcode = 'P0002'; end if;

  select * into version_row from public.content_submission_versions v
  where v.id = p_submission_version_id and v.organization_id = org_id;
  select * into item_row from public.content_items ci
  where ci.id = submission_row.content_item_id and ci.organization_id = org_id and ci.deleted_at is null
  for update;
  if not found or not private.can_access_client(item_row.client_id) then raise exception 'Content item not found' using errcode = 'P0002'; end if;
  if submission_row.status <> 'submitted' or submission_row.current_version_number <> version_row.version_number then
    raise exception 'Only the latest pending version can be reviewed' using errcode = '22023';
  end if;
  if version_row.submitted_by = actor_id then raise exception 'You cannot review your own submission' using errcode = '42501'; end if;

  insert into public.content_reviews (organization_id, submission_version_id, reviewer_id, decision, comment)
  values (org_id, p_submission_version_id, actor_id, p_decision, feedback);
  update public.content_submissions set status = p_decision::text::public.submission_status,
    approved_at = case when p_decision = 'approved' then now() else null end, updated_at = now()
  where id = submission_row.id and organization_id = org_id;
  if p_decision = 'revision_requested' then
    update public.content_items set status = 'revision_requested', revision_notes = feedback,
      next_action = 'Address supervisor feedback and resubmit'
    where id = item_row.id and organization_id = org_id;
  else
    update public.content_items set status = submission_row.content_status_before_review,
      revision_notes = null, next_action = 'Schedule or publish the approved content'
    where id = item_row.id and organization_id = org_id;
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org_id, actor_id, 'content_item', item_row.id,
    case when p_decision = 'approved' then 'CONTENT_REVIEW_APPROVED' else 'CONTENT_CHANGES_REQUESTED' end,
    jsonb_build_object('submission_id', submission_row.id, 'version_id', p_submission_version_id, 'decision', p_decision, 'comment', feedback));
end;
$$;

revoke all on function public.submit_content_for_review(uuid, uuid[], text) from public, anon;
revoke all on function public.review_content_submission(uuid, public.review_decision, text) from public, anon;
grant execute on function public.submit_content_for_review(uuid, uuid[], text) to authenticated;
grant execute on function public.review_content_submission(uuid, public.review_decision, text) to authenticated;

commit;

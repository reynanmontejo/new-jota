-- Development-only seed data. No auth users or profiles are created here.
-- Add users through Supabase Auth, then attach their profile and role records.

insert into public.organizations (id, name, slug, timezone)
values ('10000000-0000-0000-0000-000000000001', 'Northstar Marketing', 'northstar-marketing', 'America/New_York')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  timezone = excluded.timezone;

insert into public.roles (id, organization_id, code, name, description, is_system) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'account_manager', 'Account Manager', 'Manages assigned client work.', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'supervisor', 'Supervisor', 'Coordinates teams and reviews submissions.', true),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'administrator', 'Administrator', 'Manages the organization and access.', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system;

insert into public.role_permissions (organization_id, role_id, permission_code)
select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', code
from public.permissions
where code in (
  'clients.view_assigned',
  'campaigns.create', 'campaigns.update',
  'content.create', 'content.update',
  'tasks.create', 'tasks.update'
)
on conflict do nothing;

insert into public.role_permissions (organization_id, role_id, permission_code)
select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', code
from public.permissions
where code in (
  'clients.view_assigned', 'clients.view_all',
  'campaigns.create', 'campaigns.update',
  'content.create', 'content.update',
  'tasks.create', 'tasks.update', 'tasks.assign', 'tasks.review', 'tasks.approve',
  'employees.view'
)
on conflict do nothing;

insert into public.role_permissions (organization_id, role_id, permission_code)
select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', code
from public.permissions
on conflict do nothing;

insert into public.clients (id, organization_id, name, slug, description) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Luma Skincare', 'luma-skincare', 'Premium skincare campaigns and community content.'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Northwind Coffee', 'northwind-coffee', 'Seasonal product stories and retail marketing.'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Harbor & Pine', 'harbor-and-pine', 'Editorial and lifestyle content program.')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.campaigns (id, organization_id, client_id, name, status, start_date, end_date) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Autumn Glow Launch', 'active', '2026-09-01', '2026-10-31'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Cold Brew Stories', 'active', '2026-09-01', '2026-11-15'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Fall Editorial', 'active', '2026-09-15', '2026-11-30')
on conflict (id) do update set
  name = excluded.name,
  status = excluded.status,
  start_date = excluded.start_date,
  end_date = excluded.end_date;

insert into public.content_items (id, organization_id, client_id, campaign_id, title, platform, content_type, status, publish_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Autumn launch carousel', 'Instagram', 'Carousel', 'in_production', '2026-09-28 14:00:00-04'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Cold brew founder story', 'LinkedIn', 'Carousel', 'planned', '2026-09-30 10:00:00-04'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'October editorial reel', 'Instagram', 'Reel', 'planned', '2026-10-02 13:00:00-04')
on conflict (id) do update set
  title = excluded.title,
  status = excluded.status,
  publish_at = excluded.publish_at;

insert into public.tasks (id, organization_id, client_id, campaign_id, content_item_id, title, status, priority, due_at) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Finalize launch-day captions', 'in_progress', 'high', '2026-09-25 10:30:00-04'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Upload carousel design V2', 'revision_requested', 'urgent', '2026-09-25 13:00:00-04'),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'Review October content brief', 'todo', 'medium', '2026-09-25 15:30:00-04')
on conflict (id) do update set
  title = excluded.title,
  status = excluded.status,
  priority = excluded.priority,
  due_at = excluded.due_at;

insert into public.tools (id, name, slug, description, url) values
  ('70000000-0000-0000-0000-000000000001', 'Google Drive', 'google-drive', 'Shared Drive files and deliverables.', 'https://drive.google.com/'),
  ('70000000-0000-0000-0000-000000000002', 'Canva', 'canva', 'Brand and campaign design workspace.', 'https://www.canva.com/')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  url = excluded.url;

insert into public.organization_tools (organization_id, tool_id)
values
  ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002')
on conflict do nothing;

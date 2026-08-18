-- Site Audits: weekly/fortnightly site walks with items, photos, PDF, and foreman delivery.

create table if not exists site_audits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  audited_by_name text not null,
  audited_by_role text,
  audit_date timestamptz not null default now(),
  general_notes text,
  status text not null default 'draft',
  pdf_path text,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_recipients (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,
  sent_via text not null,
  sent_at timestamptz not null default now(),
  delivery_status text not null default 'sent',
  error_message text
);
create index if not exists idx_site_audit_recipients_audit on site_audit_recipients(audit_id);
alter table site_audit_recipients enable row level security;

create table if not exists site_audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  plot_number text not null,
  description text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references site_audit_items(id) on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_views (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (audit_id, worker_id)
);
create index if not exists idx_site_audit_views_worker on site_audit_views(worker_id);

create index if not exists idx_site_audits_site on site_audits(site_id);
create index if not exists idx_site_audit_items_audit on site_audit_items(audit_id);
create index if not exists idx_site_audit_photos_item on site_audit_photos(item_id);

alter table site_audits enable row level security;
alter table site_audit_items enable row level security;
alter table site_audit_photos enable row level security;
alter table site_audit_views enable row level security;
-- no public policies; service-role via server routes only

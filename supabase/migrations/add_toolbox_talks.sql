-- Toolbox Talks: templates, talks, and attendee signatures.
create table if not exists toolbox_talk_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists toolbox_talks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  title text not null,
  description text not null,
  conducted_by_name text not null,
  conducted_by_role text,
  manager_signature_path text,
  conducted_at timestamptz not null default now(),
  pdf_path text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists toolbox_talk_attendees (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references toolbox_talks(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,
  worker_role text,
  signature_path text,
  signed_at timestamptz
);

create index if not exists idx_toolbox_talks_site on toolbox_talks(site_id);
create index if not exists idx_toolbox_talk_attendees_talk on toolbox_talk_attendees(talk_id);

alter table toolbox_talk_templates enable row level security;
alter table toolbox_talks enable row level security;
alter table toolbox_talk_attendees enable row level security;

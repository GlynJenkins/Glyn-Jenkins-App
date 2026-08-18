-- Audit log when an admin reveals full bank / UTR / NI on a worker profile.
create table if not exists sensitive_reveals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  revealed_by text not null,
  revealed_at timestamptz not null default now(),
  fields text not null
);

create index if not exists idx_sensitive_reveals_worker on sensitive_reveals(worker_id);

alter table sensitive_reveals enable row level security;
-- no public policies; service-role access only

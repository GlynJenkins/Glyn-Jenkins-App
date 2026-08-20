-- Foreman can mark a site audit as done (actioned) for themselves.
-- Seen (opened/dismissed) stays separate from completed_at (work finished).

alter table site_audit_views
  add column if not exists completed_at timestamptz;

create index if not exists idx_site_audit_views_completed
  on site_audit_views (worker_id, completed_at)
  where completed_at is not null;

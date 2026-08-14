-- Toolbox Talks amendments: track when a completed talk is revised.
alter table toolbox_talks
  add column if not exists amended_at timestamptz,
  add column if not exists amendment_count int not null default 0;

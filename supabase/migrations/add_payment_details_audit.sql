-- Audit trail when admin corrects bank / UTR / NI on a worker profile.
alter table workers
  add column if not exists payment_details_updated_at timestamptz,
  add column if not exists payment_details_updated_by text;

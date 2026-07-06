-- Bank details captured from worker registration, snapshotted when a claim is approved.
ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS payee_name text,
  ADD COLUMN IF NOT EXISTS payee_sort_code text,
  ADD COLUMN IF NOT EXISTS payee_account_number text;

-- Backfill existing pay records from worker registration data.
UPDATE worker_cis_ledger AS l
SET
  payee_name = trim(w.first_name || ' ' || w.surname),
  payee_sort_code = w.bank_sort_code,
  payee_account_number = w.bank_account_number
FROM workers AS w
WHERE l.worker_id = w.id
  AND (
    l.payee_sort_code IS NULL
    OR l.payee_account_number IS NULL
    OR l.payee_name IS NULL
  );

-- National Insurance for employed apprentices (PAYE payroll).
ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS national_insurance NUMERIC(10,2) NOT NULL DEFAULT 0;

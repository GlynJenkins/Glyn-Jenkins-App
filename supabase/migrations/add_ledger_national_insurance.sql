-- Apprentice NI on the wages register / CIS ledger (editable at booking-in).
ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS national_insurance numeric(10, 2) DEFAULT 0;

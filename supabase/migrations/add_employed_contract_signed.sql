-- Employed staff attestation at enrolment (Management / Contracts Manager).
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS employed_contract_signed boolean NOT NULL DEFAULT false;

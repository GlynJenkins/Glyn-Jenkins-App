-- Run once in Supabase SQL editor (adds columns used by worker registration)

ALTER TABLE workers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS ni_number text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS cscs_number text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS cscs_expiry_date date;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS subcontract_signature_url text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS subcontract_agreement_pdf_url text;

-- If role is a PostgreSQL enum, add Management (run only if registration fails on role):
-- ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'management';

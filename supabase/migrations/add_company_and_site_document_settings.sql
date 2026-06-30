-- Company branding for PDFs and site document details for variations/inspections.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS logo_storage_path text;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS document_address text,
  ADD COLUMN IF NOT EXISTS developer_name text,
  ADD COLUMN IF NOT EXISTS developer_contact text,
  ADD COLUMN IF NOT EXISTS surveyor_name text,
  ADD COLUMN IF NOT EXISTS document_reference text;

-- Sensible default company name for existing installs.
UPDATE admin_settings
SET company_name = 'Glyn Jenkins LTD'
WHERE company_name IS NULL OR trim(company_name) = '';

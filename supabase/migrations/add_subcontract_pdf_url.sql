-- Run once in Supabase SQL editor
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS subcontract_agreement_pdf_url text;

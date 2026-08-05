-- Bricklayer qualification text + Health & Safety (SSSTS/SMSTS) document on enrolment.
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS bricklayer_qualification text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS hs_qualification_url text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS hs_qualification_na boolean NOT NULL DEFAULT false;

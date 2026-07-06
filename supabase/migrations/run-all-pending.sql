-- ============================================================
-- GLYN JENKINS LTD — run all pending migrations (idempotent)
-- Paste into Supabase → SQL Editor → Run once.
-- Safe to re-run: every statement uses IF NOT EXISTS / IF EXISTS.
-- ============================================================

-- 1. Worker induction columns
ALTER TABLE workers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS ni_number text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS cscs_number text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS cscs_expiry_date date;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS subcontract_signature_url text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS subcontract_agreement_pdf_url text;

-- 2. Subcontract PDF URL (duplicate-safe with step 1)
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS subcontract_agreement_pdf_url text;

-- 3. CIS ledger — apprentice national insurance
ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS national_insurance numeric(10, 2) DEFAULT 0;

-- 4. Management holiday tracker
CREATE TABLE IF NOT EXISTS management_holiday_allowances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  allocated_days  numeric(5, 1) NOT NULL DEFAULT 25,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, year)
);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_allowances_year
  ON management_holiday_allowances (year);

CREATE TABLE IF NOT EXISTS management_holiday_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days_requested  numeric(5, 1) NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  note            text,
  admin_note      text,
  reviewed_by     uuid REFERENCES workers(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_worker
  ON management_holiday_requests (worker_id);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_status
  ON management_holiday_requests (status);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_dates
  ON management_holiday_requests (start_date, end_date);

-- 5. Developer variation submissions
CREATE TABLE IF NOT EXISTS variation_developer_submissions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key            text NOT NULL,
  site_id                   uuid NOT NULL REFERENCES sites(id),
  foreman_id                uuid NOT NULL REFERENCES workers(id),
  description               text NOT NULL,
  photo_urls                text[] NOT NULL DEFAULT '{}',
  status                    text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'submitted', 'agreed', 'paid')),
  foreman_total             numeric(12, 2) NOT NULL DEFAULT 0,
  developer_total           numeric(12, 2) NOT NULL DEFAULT 0,
  payment_status            text NOT NULL DEFAULT 'unpaid'
                            CHECK (payment_status IN ('unpaid', 'paid')),
  submitted_to_developer_at timestamptz,
  agreed_at                 timestamptz,
  paid_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variation_dev_submissions_status
  ON variation_developer_submissions (status);

CREATE INDEX IF NOT EXISTS idx_variation_dev_submissions_site
  ON variation_developer_submissions (site_id);

ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS developer_submission_id uuid
    REFERENCES variation_developer_submissions(id) ON DELETE SET NULL;

ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS developer_hours numeric(8, 2);

ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS developer_rate_per_hour numeric(10, 2);

-- 6. Developer variation lines + material uplift
CREATE TABLE IF NOT EXISTS variation_developer_lines (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_submission_id   uuid NOT NULL
                            REFERENCES variation_developer_submissions(id) ON DELETE CASCADE,
  worker_role               text NOT NULL
                            CHECK (worker_role IN ('bricklayer', 'labourer', 'apprentice')),
  developer_hours           numeric(8, 2) NOT NULL DEFAULT 0,
  developer_rate_per_hour   numeric(10, 2) NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variation_developer_lines_submission
  ON variation_developer_lines (developer_submission_id);

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS material_uplift_enabled boolean NOT NULL DEFAULT false;

-- 7. Developer variation "agreed" status
ALTER TABLE variation_developer_submissions
  DROP CONSTRAINT IF EXISTS variation_developer_submissions_status_check;

ALTER TABLE variation_developer_submissions
  ADD CONSTRAINT variation_developer_submissions_status_check
  CHECK (status IN ('draft', 'submitted', 'agreed', 'paid'));

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS agreed_at timestamptz;

-- 8. Worker bank columns (from registration) + payee snapshot on ledger
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS bank_sort_code text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS bank_account_number text;

ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS payee_name text;

ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS payee_sort_code text;

ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS payee_account_number text;

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

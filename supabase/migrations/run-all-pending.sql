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

-- 9. QA inspection audit trail — prior sign-offs are archived here before a
--    re-inspection overwrites them (Part 2 fixes, Task 5).
CREATE TABLE IF NOT EXISTS qa_inspection_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  uuid NOT NULL,
  site_id        uuid NOT NULL,
  plot_number    text NOT NULL,
  stage          text NOT NULL,
  status         text,
  form_data      jsonb,
  notes          text,
  signature_path text,
  pdf_path       text,
  inspected_by   uuid,
  inspected_at   timestamptz,
  archived_at    timestamptz NOT NULL DEFAULT now(),
  archived_by    uuid
);

CREATE INDEX IF NOT EXISTS idx_qa_inspection_history_site_plot
  ON qa_inspection_history (site_id, plot_number, stage);

ALTER TABLE qa_inspection_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_inspection_history FORCE ROW LEVEL SECURITY;

-- 10. Persisted VO numbers on variation claims (Part 2 fixes, Task 8) —
--     allocated once at approval instead of recomputed on every read.
ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS vo_number integer;

WITH grouped AS (
  SELECT
    site_id,
    COALESCE(photo_urls[1], id::text) AS grp,
    MIN(approved_at) AS first_approved
  FROM variation_claims
  WHERE status = 'approved'
  GROUP BY site_id, COALESCE(photo_urls[1], id::text)
),
numbered AS (
  SELECT
    site_id,
    grp,
    ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY first_approved NULLS LAST, grp) AS rn
  FROM grouped
)
UPDATE variation_claims c
SET vo_number = n.rn
FROM numbered n
WHERE c.status = 'approved'
  AND c.vo_number IS NULL
  AND c.site_id = n.site_id
  AND COALESCE(c.photo_urls[1], c.id::text) = n.grp;

-- 11. Make variation_claims.total_amount a generated column (hours × rate).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'variation_claims'
      AND column_name  = 'total_amount'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE NOTICE 'variation_claims.total_amount is already a generated column — skipping.';
  ELSE
    ALTER TABLE variation_claims DROP COLUMN IF EXISTS total_amount;

    ALTER TABLE variation_claims
      ADD COLUMN total_amount numeric(12, 2)
      GENERATED ALWAYS AS (round((COALESCE(hours, 0) * COALESCE(rate_per_hour, 0))::numeric, 2)) STORED;
  END IF;
END $$;

-- 12. Registration privacy consent timestamp (pre-enrolment hardening, Task 3).
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;

-- 13. Contracts Manager & Site Supervisor roles.
-- Prefer section 15 for management/jetwasher — those were historically missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_role') THEN
    BEGIN
      ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'contracts_manager';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'site_supervisor';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workers'
      AND column_name  = 'role'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_role_check;
    ALTER TABLE workers DROP CONSTRAINT IF EXISTS worker_role_check;

    ALTER TABLE workers
      ADD CONSTRAINT workers_role_check
      CHECK (role IN (
        'admin',
        'management',
        'foreman',
        'bricklayer',
        'labourer',
        'apprentice',
        'jetwasher',
        'contracts_manager',
        'site_supervisor'
      ));
  END IF;
END $$;

-- 14. Induction qualifications (bricklayer trade quals + SSSTS/SMSTS for all roles).
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS bricklayer_qualification text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS hs_qualification_url text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS hs_qualification_na boolean NOT NULL DEFAULT false;

-- 15. Add missing worker_role enum values (management + jetwasher).
-- Run add_management_enum_value.sql on its own in Supabase if this batch fails
-- (ALTER TYPE ... ADD VALUE prefers not to sit inside a larger transaction).
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'jetwasher';

-- 16. Employed contract attestation (Management / Contracts Manager enrolment).
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS employed_contract_signed boolean NOT NULL DEFAULT false;

-- 17. Toolbox Talks.
create table if not exists toolbox_talk_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists toolbox_talks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  title text not null,
  description text not null,
  conducted_by_name text not null,
  conducted_by_role text,
  manager_signature_path text,
  conducted_at timestamptz not null default now(),
  pdf_path text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists toolbox_talk_attendees (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references toolbox_talks(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,
  worker_role text,
  signature_path text,
  signed_at timestamptz
);

create index if not exists idx_toolbox_talks_site on toolbox_talks(site_id);
create index if not exists idx_toolbox_talk_attendees_talk on toolbox_talk_attendees(talk_id);

alter table toolbox_talk_templates enable row level security;
alter table toolbox_talks enable row level security;
alter table toolbox_talk_attendees enable row level security;

-- 18. Toolbox Talk amendments.
alter table toolbox_talks
  add column if not exists amended_at timestamptz,
  add column if not exists amendment_count int not null default 0;

-- 19. Firesock training certificate at enrolment.
alter table workers add column if not exists firesock_certificate_url text;

-- 20. Date of birth at enrolment.
alter table workers add column if not exists date_of_birth date;

-- 21. Admin payment-details edit audit.
alter table workers
  add column if not exists payment_details_updated_at timestamptz,
  add column if not exists payment_details_updated_by text;

-- 22. Audit log for revealing bank / UTR / NI on worker profiles.
create table if not exists sensitive_reveals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  revealed_by text not null,
  revealed_at timestamptz not null default now(),
  fields text not null
);

create index if not exists idx_sensitive_reveals_worker on sensitive_reveals(worker_id);

alter table sensitive_reveals enable row level security;

-- 23. Site Audits (weekly/fortnightly site walks).
create table if not exists site_audits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  audited_by_name text not null,
  audited_by_role text,
  audit_date timestamptz not null default now(),
  general_notes text,
  status text not null default 'draft',
  pdf_path text,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_recipients (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,
  sent_via text not null,
  sent_at timestamptz not null default now(),
  delivery_status text not null default 'sent',
  error_message text
);
create index if not exists idx_site_audit_recipients_audit on site_audit_recipients(audit_id);
alter table site_audit_recipients enable row level security;

create table if not exists site_audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  plot_number text not null,
  description text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references site_audit_items(id) on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists site_audit_views (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (audit_id, worker_id)
);
create index if not exists idx_site_audit_views_worker on site_audit_views(worker_id);

create index if not exists idx_site_audits_site on site_audits(site_id);
create index if not exists idx_site_audit_items_audit on site_audit_items(audit_id);
create index if not exists idx_site_audit_photos_item on site_audit_photos(item_id);

alter table site_audits enable row level security;
alter table site_audit_items enable row level security;
alter table site_audit_photos enable row level security;
alter table site_audit_views enable row level security;

-- 24. Foreman marks site audit as done (actioned).
alter table site_audit_views
  add column if not exists completed_at timestamptz;

create index if not exists idx_site_audit_views_completed
  on site_audit_views (worker_id, completed_at)
  where completed_at is not null;

-- 25. Worker home address (Worker Matrix / enrolment).
alter table workers add column if not exists home_address text;

-- 26. Claim foreman name snapshot (lift history survives leavers).
alter table claim_periods
  add column if not exists foreman_name text;

alter table claim_periods
  alter column foreman_id drop not null;

update claim_periods as c
set foreman_name = nullif(trim(concat_ws(' ', w.first_name, w.surname)), '')
from workers as w
where c.foreman_id = w.id
  and (c.foreman_name is null or btrim(c.foreman_name) = '');

-- 27. RLS on tables that may post-date the bulk enable script.
alter table if exists public.jetwash_plot_status enable row level security;
alter table if exists public.jetwash_plot_status force row level security;
alter table if exists public.firesock_plot_status enable row level security;
alter table if exists public.firesock_plot_status force row level security;
alter table if exists public.firesock_plot_photos enable row level security;
alter table if exists public.firesock_plot_photos force row level security;
alter table if exists public.qa_plot_inspections enable row level security;
alter table if exists public.qa_plot_inspections force row level security;
alter table if exists public.qa_inspection_history enable row level security;
alter table if exists public.qa_inspection_history force row level security;
alter table if exists public.variation_developer_submissions enable row level security;
alter table if exists public.variation_developer_submissions force row level security;
alter table if exists public.variation_developer_lines enable row level security;
alter table if exists public.variation_developer_lines force row level security;
alter table if exists public.management_holiday_allowances enable row level security;
alter table if exists public.management_holiday_allowances force row level security;
alter table if exists public.management_holiday_requests enable row level security;
alter table if exists public.management_holiday_requests force row level security;


-- 28. Claimed money + atomic claim RPCs (B1/B2):
--     Run separately in SQL Editor: supabase/migrations/price_grid_claimed_value.sql

-- Management-created developer variations, lump-sum foreman pay, plot assignment.

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'foreman',
  ADD COLUMN IF NOT EXISTS claim_mode text NOT NULL DEFAULT 'foreman_payable',
  ADD COLUMN IF NOT EXISTS plot_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS foreman_lump_sum numeric(12, 2),
  ADD COLUMN IF NOT EXISTS assigned_foreman_id uuid REFERENCES workers(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES workers(id);

ALTER TABLE variation_developer_submissions
  DROP CONSTRAINT IF EXISTS variation_developer_submissions_source_check;

ALTER TABLE variation_developer_submissions
  ADD CONSTRAINT variation_developer_submissions_source_check
  CHECK (source IN ('foreman', 'management'));

ALTER TABLE variation_developer_submissions
  DROP CONSTRAINT IF EXISTS variation_developer_submissions_claim_mode_check;

ALTER TABLE variation_developer_submissions
  ADD CONSTRAINT variation_developer_submissions_claim_mode_check
  CHECK (claim_mode IN ('foreman_payable', 'company_profit'));

-- Management / company-profit rows may have no foreman.
ALTER TABLE variation_developer_submissions
  ALTER COLUMN foreman_id DROP NOT NULL;

ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS is_lump_sum boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lump_sum_label text,
  ADD COLUMN IF NOT EXISTS assigned_foreman_id uuid REFERENCES workers(id);

-- Lump-sum lines have no worker breakdown.
ALTER TABLE variation_claims
  ALTER COLUMN worker_id DROP NOT NULL;

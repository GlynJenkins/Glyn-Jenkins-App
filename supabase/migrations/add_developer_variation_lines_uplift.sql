-- Admin-only extra lines on developer variations (not from foreman submission).
-- Optional 10% material uplift on labour subtotal.

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

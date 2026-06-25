-- Developer variation submissions (admin/management only).
-- Foreman charges stay on variation_claims.hours / rate_per_hour (internal log).
-- Admin-adjusted figures live in developer_hours / developer_rate_per_hour.

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

-- Optional: backfill developer submissions for already-approved variation groups.
-- Run only once if you had approved variations before this migration.
/*
INSERT INTO variation_developer_submissions (
  submission_key, site_id, foreman_id, description, photo_urls,
  status, foreman_total, developer_total, payment_status
)
SELECT DISTINCT ON (COALESCE(v.photo_urls[1], v.id::text))
  COALESCE(v.photo_urls[1], v.id::text),
  v.site_id,
  v.foreman_id,
  v.description,
  v.photo_urls,
  'draft',
  0,
  0,
  'unpaid'
FROM variation_claims v
WHERE v.status = 'approved'
  AND v.developer_submission_id IS NULL
ORDER BY COALESCE(v.photo_urls[1], v.id::text), v.created_at;
-- Then link lines and set totals via app or follow-up SQL.
*/

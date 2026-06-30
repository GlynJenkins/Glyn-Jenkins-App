-- Site codes (e.g. 001) and per-site variation order numbers (V01, V02…).

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS site_code text;

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS vo_number integer;

-- Backfill site codes for existing sites (001, 002, … by created_at).
DO $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  SELECT COALESCE(MAX(CAST(site_code AS INTEGER)), 0) INTO n
  FROM sites
  WHERE site_code ~ '^\d+$';

  FOR r IN
    SELECT id FROM sites WHERE site_code IS NULL ORDER BY created_at
  LOOP
    n := n + 1;
    UPDATE sites SET site_code = LPAD(n::text, 3, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sites_site_code_unique
  ON sites (site_code)
  WHERE site_code IS NOT NULL;

-- Backfill VO numbers per site (first submission = 1 → V01).
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY created_at) AS rn
  FROM variation_developer_submissions
)
UPDATE variation_developer_submissions v
SET vo_number = numbered.rn
FROM numbered
WHERE v.id = numbered.id
  AND v.vo_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS variation_dev_sub_site_vo_unique
  ON variation_developer_submissions (site_id, vo_number)
  WHERE vo_number IS NOT NULL;

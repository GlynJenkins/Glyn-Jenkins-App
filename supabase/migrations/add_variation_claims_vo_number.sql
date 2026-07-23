-- Persist VO numbers on variation claims (Part 2 fixes, Task 8).
-- Previously the register recomputed V01/V02… from approved_at order on every
-- read, which renumbered earlier VOs whenever one was re-approved. Now the
-- number is allocated once at approval and stored.

ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS vo_number integer;

-- Backfill already-approved claims in the same order the register used to
-- compute (per site, submission groups ordered by first approval date), so
-- existing references don't change.
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

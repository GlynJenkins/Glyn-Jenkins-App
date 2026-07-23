-- Payroll hardening: idempotent approvals + no duplicate fortnight claims.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- ── 1. Remove duplicate ledger rows (double-pay artifacts), keep the first ──
-- Duplicates can exist if an approval was retried mid-failure. The first row
-- per allocation is the one kept; later duplicates are removed.

DELETE FROM worker_cis_ledger a
USING worker_cis_ledger b
WHERE a.claim_allocation_id IS NOT NULL
  AND a.claim_allocation_id = b.claim_allocation_id
  AND a.ctid > b.ctid;

-- One ledger row per claim allocation — makes approval retries safe.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_worker_cis_ledger_allocation
  ON worker_cis_ledger (claim_allocation_id)
  WHERE claim_allocation_id IS NOT NULL;

-- ── 2. Auto-reject older duplicate PENDING claims per foreman + fortnight ──
-- (Keeps the newest; approved claims are never touched automatically.)

WITH ranked AS (
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY foreman_id, period_start, period_end
      ORDER BY (status = 'approved') DESC, submitted_at DESC NULLS LAST
    ) AS rn
  FROM claim_periods
  WHERE status IN ('pending', 'approved')
)
UPDATE claim_periods c
SET
  status           = 'rejected',
  rejection_reason = 'Superseded duplicate claim (automatic cleanup)',
  rejected_at      = now()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1
  AND c.status = 'pending';

-- One active (pending or approved) claim per foreman per fortnight.
-- If this fails with a duplicate error, two APPROVED claims exist for the
-- same foreman + fortnight — resolve those manually before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_claim_periods_foreman_active_period
  ON claim_periods (foreman_id, period_start, period_end)
  WHERE status IN ('pending', 'approved');

-- ── 3. Verification ──────────────────────────────────────────────────────
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('worker_cis_ledger', 'claim_periods')
--     AND indexname LIKE 'uniq_%';
--
-- Expect both: uniq_worker_cis_ledger_allocation,
--              uniq_claim_periods_foreman_active_period

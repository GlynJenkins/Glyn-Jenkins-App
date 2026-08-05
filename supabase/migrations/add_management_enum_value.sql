-- Fix: the worker_role enum is missing 'management' (and 'jetwasher').
--
-- Root cause of "can't change a worker to Management": the enum values were
-- only ever referenced in commented-out notes, never actually added, so the
-- database rejected the role update with a 500 error. contracts_manager and
-- site_supervisor were added correctly, which is why those roles work.
--
-- Run this in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS).
-- Note: run these on their own — ALTER TYPE ... ADD VALUE should not be
-- wrapped in a larger transaction, and the new value can't be used in the
-- same statement batch that adds it.

ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'jetwasher';

-- Verify afterwards (should list management, jetwasher, contracts_manager,
-- site_supervisor, plus the base roles):
--
--   SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = 'worker_role'::regtype
--   ORDER BY enumlabel;

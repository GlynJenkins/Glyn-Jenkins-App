-- Contracts Manager & Site Supervisor portal roles.
-- Prefer enum values; if workers.role is text + CHECK, widen the constraint instead.

DO $$
BEGIN
  -- Case A: Postgres enum type named worker_role
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

  -- Case B: plain text/varchar with a CHECK constraint listing allowed roles
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

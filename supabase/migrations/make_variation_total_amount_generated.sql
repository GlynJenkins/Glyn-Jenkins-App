-- Ensure variation_claims.total_amount is always hours × rate_per_hour.
-- Part 2 brief: if the column is not Generated in Supabase, convert it so a
-- stale/wrong total can never be stored independently of hours and rate.

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
    -- Drop the plain column and replace with a stored generated one.
    -- Existing inserts only set hours / rate_per_hour (never total_amount),
    -- and all current rows already match hours × rate_per_hour.
    ALTER TABLE variation_claims DROP COLUMN IF EXISTS total_amount;

    ALTER TABLE variation_claims
      ADD COLUMN total_amount numeric(12, 2)
      GENERATED ALWAYS AS (round((COALESCE(hours, 0) * COALESCE(rate_per_hour, 0))::numeric, 2)) STORED;
  END IF;
END $$;

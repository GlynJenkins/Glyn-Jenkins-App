-- Enable Row Level Security on every table in public.
--
-- The app uses the service-role key on the server only (see src/lib/supabase/server.ts).
-- Service role bypasses RLS, so admin/foreman/API routes keep working.
-- The public anon key is shipped in the browser; with RLS on and no permissive
-- policies, direct REST calls (e.g. /rest/v1/workers) return no rows.
--
-- Run in Supabase → SQL Editor, then verify with the query at the bottom.

-- ── 1. Enable + force RLS on all public tables ───────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ── 2. Known application tables (explicit, for audit logs) ───────────────────
-- workers, sites, site_stages, price_grid, foreman_site_assignments,
-- claim_periods, claim_allocations, variation_claims,
-- variation_developer_submissions, variation_developer_lines,
-- worker_cis_ledger, admin_settings, apprentice_holiday_ledger,
-- management_holiday_allowances, management_holiday_requests,
-- firesock_plot_status, firesock_plot_photos, jetwash_plot_status
-- (plus any other tables created in the Supabase dashboard — step 1 covers all)

-- ── 3. Storage: keep worker documents private ───────────────────────────────

UPDATE storage.buckets
SET public = false
WHERE id = 'worker-documents';

-- Storage objects already have RLS in Supabase; ensure no anonymous read paths.
-- Drop open policies on worker-documents if they were added manually in the dashboard.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname ILIKE '%public%'
        OR policyname ILIKE '%anon%'
        OR policyname ILIKE '%everyone%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- ── 4. Verification (run separately after migration) ─────────────────────────
--
-- All public tables should show rowsecurity = true:
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- Live test (replace URL and ANON_KEY; expect [] or 401, NOT worker rows):
--
--   curl -s "https://YOUR_PROJECT.supabase.co/rest/v1/workers?select=id&limit=1" \
--     -H "apikey: YOUR_ANON_KEY" \
--     -H "Authorization: Bearer YOUR_ANON_KEY"
--
-- Supabase → Advisors → Security Advisor should show no "RLS disabled" tables.

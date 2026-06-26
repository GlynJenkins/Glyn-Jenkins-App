-- Jetwash plot tracking: mirrors plot numbers from price_grid per site.

CREATE TABLE IF NOT EXISTS jetwash_plot_status (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plot_number  text NOT NULL,
  washed_at    timestamptz,
  washed_by    uuid REFERENCES workers(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, plot_number)
);

CREATE INDEX IF NOT EXISTS idx_jetwash_plot_status_site
  ON jetwash_plot_status (site_id);

CREATE INDEX IF NOT EXISTS idx_jetwash_plot_status_washed
  ON jetwash_plot_status (site_id, washed_at);

-- If workers.role uses PostgreSQL enum worker_role, run in Supabase SQL Editor:
-- ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'jetwasher';

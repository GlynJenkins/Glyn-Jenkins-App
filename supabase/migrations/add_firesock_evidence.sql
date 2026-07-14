-- Roof firesock evidence per plot (mirrors price_grid plots on import).

CREATE TABLE IF NOT EXISTS firesock_plot_status (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plot_number       text NOT NULL,
  requires_evidence boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, plot_number)
);

CREATE TABLE IF NOT EXISTS firesock_plot_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plot_number  text NOT NULL,
  photo_path   text NOT NULL,
  sort_order   int NOT NULL DEFAULT 0,
  uploaded_by  uuid REFERENCES workers(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firesock_plot_status_site
  ON firesock_plot_status (site_id);

CREATE INDEX IF NOT EXISTS idx_firesock_plot_photos_site_plot
  ON firesock_plot_photos (site_id, plot_number);

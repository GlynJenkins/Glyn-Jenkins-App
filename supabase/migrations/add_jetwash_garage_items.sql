-- Add separate garage wash items per plot (e.g. double garage).

ALTER TABLE jetwash_plot_status
  ADD COLUMN IF NOT EXISTS item_type  text NOT NULL DEFAULT 'house',
  ADD COLUMN IF NOT EXISTS item_label text NOT NULL DEFAULT '';

ALTER TABLE jetwash_plot_status
  DROP CONSTRAINT IF EXISTS jetwash_plot_status_site_id_plot_number_key;

ALTER TABLE jetwash_plot_status
  ADD CONSTRAINT jetwash_plot_status_site_plot_item_unique
  UNIQUE (site_id, plot_number, item_type, item_label);

ALTER TABLE jetwash_plot_status
  DROP CONSTRAINT IF EXISTS jetwash_plot_status_item_type_check;

ALTER TABLE jetwash_plot_status
  ADD CONSTRAINT jetwash_plot_status_item_type_check
  CHECK (item_type IN ('house', 'garage'));

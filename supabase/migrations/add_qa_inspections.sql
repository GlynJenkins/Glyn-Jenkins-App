-- Quality inspection logs per plot and stage.

CREATE TABLE IF NOT EXISTS qa_plot_inspections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plot_number   text NOT NULL,
  stage         text NOT NULL CHECK (stage IN ('joist_lift', 'plate_roof', 'pre_plaster', 'cml')),
  status        text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
  form_data     jsonb NOT NULL DEFAULT '{}',
  notes         text,
  signature_path text,
  pdf_path      text,
  inspected_by  uuid REFERENCES workers(id),
  inspected_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, plot_number, stage)
);

CREATE INDEX IF NOT EXISTS idx_qa_plot_inspections_site
  ON qa_plot_inspections (site_id);

CREATE INDEX IF NOT EXISTS idx_qa_plot_inspections_site_plot
  ON qa_plot_inspections (site_id, plot_number);

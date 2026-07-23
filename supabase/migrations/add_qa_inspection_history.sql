-- Immutable audit trail for QA inspections.
-- Before a completed inspection is overwritten by a re-inspection, the prior
-- row is copied here so the original sign-off (who/when/result/PDF) is never lost.

CREATE TABLE IF NOT EXISTS qa_inspection_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  uuid NOT NULL,
  site_id        uuid NOT NULL,
  plot_number    text NOT NULL,
  stage          text NOT NULL,
  status         text,
  form_data      jsonb,
  notes          text,
  signature_path text,
  pdf_path       text,
  inspected_by   uuid,
  inspected_at   timestamptz,
  archived_at    timestamptz NOT NULL DEFAULT now(),
  archived_by    uuid
);

CREATE INDEX IF NOT EXISTS idx_qa_inspection_history_site_plot
  ON qa_inspection_history (site_id, plot_number, stage);

ALTER TABLE qa_inspection_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_inspection_history FORCE ROW LEVEL SECURITY;

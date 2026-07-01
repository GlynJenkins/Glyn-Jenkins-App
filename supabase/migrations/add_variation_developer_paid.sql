-- Track when the developer has paid for an approved variation (VO register).
ALTER TABLE variation_claims
  ADD COLUMN IF NOT EXISTS developer_paid_at TIMESTAMPTZ;

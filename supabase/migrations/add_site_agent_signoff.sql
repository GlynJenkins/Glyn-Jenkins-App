-- Site agent sign-off on developer variation submissions (on-site tablet flow).

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS site_agent_name text,
  ADD COLUMN IF NOT EXISTS site_agent_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_agent_signature_path text;

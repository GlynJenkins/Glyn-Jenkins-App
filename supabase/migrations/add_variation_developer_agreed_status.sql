-- Add "agreed" status: developer must agree before foreman variation is approved.

ALTER TABLE variation_developer_submissions
  DROP CONSTRAINT IF EXISTS variation_developer_submissions_status_check;

ALTER TABLE variation_developer_submissions
  ADD CONSTRAINT variation_developer_submissions_status_check
  CHECK (status IN ('draft', 'submitted', 'agreed', 'paid'));

ALTER TABLE variation_developer_submissions
  ADD COLUMN IF NOT EXISTS agreed_at timestamptz;

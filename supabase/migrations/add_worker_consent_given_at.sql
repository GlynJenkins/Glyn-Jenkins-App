-- Record that the worker consented to data processing at registration
-- (UK GDPR — Part of pre-enrolment hardening, Task 3).

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;

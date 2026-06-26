-- Management holiday tracker: allowances per person + request/approval workflow.

CREATE TABLE IF NOT EXISTS management_holiday_allowances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  allocated_days  numeric(5, 1) NOT NULL DEFAULT 25,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, year)
);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_allowances_year
  ON management_holiday_allowances (year);

CREATE TABLE IF NOT EXISTS management_holiday_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days_requested  numeric(5, 1) NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  note            text,
  admin_note      text,
  reviewed_by     uuid REFERENCES workers(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_worker
  ON management_holiday_requests (worker_id);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_status
  ON management_holiday_requests (status);

CREATE INDEX IF NOT EXISTS idx_mgmt_holiday_requests_dates
  ON management_holiday_requests (start_date, end_date);

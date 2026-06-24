-- Pay cycle anchors for fortnightly booking windows and pay dates
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS pay_cycle_period_start date,
  ADD COLUMN IF NOT EXISTS pay_cycle_pay_day date;

-- Example: work window 15 Jun–28 Jun 2025, paid 3 Jul 2025 (adjust in Admin → Settings)
COMMENT ON COLUMN admin_settings.pay_cycle_period_start IS 'First day of a reference booking fortnight (14-day cycles repeat from this date)';
COMMENT ON COLUMN admin_settings.pay_cycle_pay_day IS 'Pay date for the reference fortnight (pay dates repeat every 14 days)';

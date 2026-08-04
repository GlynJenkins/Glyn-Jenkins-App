/**
 * Server-side source of truth for a variation line total.
 * Prefer hours × rate_per_hour (matches the DB generated column); fall back
 * to a stored total_amount only when hours/rate are missing.
 */
export function variationLineTotal(row: {
  hours?: number | null
  rate_per_hour?: number | null
  total_amount?: number | null
}): number {
  const hours = Number(row.hours)
  const rate  = Number(row.rate_per_hour)
  if (Number.isFinite(hours) && Number.isFinite(rate)) {
    return Math.round(hours * rate * 100) / 100
  }
  const stored = Number(row.total_amount)
  return Number.isFinite(stored) ? Math.round(stored * 100) / 100 : 0
}

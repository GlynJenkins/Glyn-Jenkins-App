export type HolidayRequestStatus = 'pending' | 'approved' | 'rejected'

export type HolidayTeamMember = {
  id: string
  first_name: string
  surname: string
  role: string
}

export type HolidayAllowanceRow = {
  worker_id: string
  year: number
  /** Total entitlement including bank holidays (what admin enters). */
  allocated_days: number
  /** England & Wales bank holidays in this year (auto-deducted). */
  bank_holiday_days: number
  /** Days staff can book: allocated − bank holidays. */
  bookable_days: number
  used_days: number
  pending_days: number
  remaining_days: number
  worker: HolidayTeamMember
}

export type HolidayRequestRow = {
  id: string
  worker_id: string
  start_date: string
  end_date: string
  days_requested: number
  status: HolidayRequestStatus
  note: string | null
  admin_note: string | null
  created_at: string
  reviewed_at: string | null
  worker: HolidayTeamMember
  reviewer: { first_name: string; surname: string } | null
}

export function daysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return diff + 1
}

function dateKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Count Mon–Fri days from start to end inclusive, excluding bank holidays.
 * Weekends and bank holidays do not consume leave allowance.
 */
export function countWorkingDays(
  startDate: string,
  endDate: string,
  bankHolidayDates: Set<string> | ReadonlySet<string> = new Set(),
): number {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0
  }

  let count = 0
  const cur = new Date(start)
  while (cur.getTime() <= end.getTime()) {
    const weekday = cur.getDay() // 0 Sun … 6 Sat
    const key = dateKeyLocal(cur)
    if (weekday !== 0 && weekday !== 6 && !bankHolidayDates.has(key)) {
      count += 1
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function formatHolidayRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const s = new Date(`${start}T12:00:00`).toLocaleDateString('en-GB', opts)
  if (start === end) return s
  const e = new Date(`${end}T12:00:00`).toLocaleDateString('en-GB', opts)
  return `${s} – ${e}`
}

export function currentHolidayYear(at = new Date()): number {
  return at.getFullYear()
}

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
  allocated_days: number
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

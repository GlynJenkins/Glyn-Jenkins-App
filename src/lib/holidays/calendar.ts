import type { HolidayRequestRow } from '@/lib/holidays/management'

export type PersonColor = {
  id: string
  label: string
  solid: string
  light: string
  text: string
  border: string
}

const PALETTE = [
  { solid: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-400' },
  { solid: 'bg-emerald-500', light: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-400' },
  { solid: 'bg-violet-500', light: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-400' },
  { solid: 'bg-orange-500', light: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-400' },
  { solid: 'bg-rose-500', light: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-400' },
  { solid: 'bg-cyan-500', light: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-400' },
  { solid: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400' },
  { solid: 'bg-indigo-500', light: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-400' },
] as const

export function buildPersonColors(
  members: { id: string; first_name: string; surname: string }[]
): PersonColor[] {
  const sorted = [...members].sort((a, b) =>
    `${a.surname} ${a.first_name}`.localeCompare(`${b.surname} ${b.first_name}`)
  )
  return sorted.map((m, i) => {
    const c = PALETTE[i % PALETTE.length]
    return {
      id:    m.id,
      label: `${m.first_name} ${m.surname}`,
      ...c,
    }
  })
}

export function colorForWorker(colors: PersonColor[], workerId: string): PersonColor | undefined {
  return colors.find((c) => c.id === workerId)
}

export function toDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

export function isDateInRange(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end
}

export type DayBooking = {
  workerId: string
  name: string
  status: 'approved' | 'pending'
}

export function bookingsForDate(
  dateKey: string,
  requests: HolidayRequestRow[]
): DayBooking[] {
  return requests
    .filter(
      (r) =>
        (r.status === 'approved' || r.status === 'pending') &&
        isDateInRange(dateKey, r.start_date, r.end_date)
    )
    .map((r) => ({
      workerId: r.worker_id,
      name:     `${r.worker.first_name} ${r.worker.surname}`,
      status:   r.status as 'approved' | 'pending',
    }))
}

/** Monday-first month grid with null padding cells. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const mondayOffset = (firstDow + 6) % 7
  const cells: (number | null)[] = Array(mondayOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year:  'numeric',
  })
}

export function shortFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

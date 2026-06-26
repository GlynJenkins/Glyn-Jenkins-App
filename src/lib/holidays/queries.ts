import { createServiceClient } from '@/lib/supabase/server'
import {
  currentHolidayYear,
  daysInclusive,
  rangesOverlap,
  type HolidayAllowanceRow,
  type HolidayRequestRow,
  type HolidayTeamMember,
} from '@/lib/holidays/management'
import { relationOne } from '@/lib/supabase/normalize-relations'

const TEAM_ROLES = ['admin', 'management'] as const

export async function fetchHolidayTeamMembers() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .in('role', [...TEAM_ROLES])
    .eq('status', 'active')
    .order('surname')

  return (data ?? []) as HolidayTeamMember[]
}

async function sumDaysForWorker(
  workerId: string,
  year: number,
  status: 'approved' | 'pending'
): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('management_holiday_requests')
    .select('days_requested, start_date')
    .eq('worker_id', workerId)
    .eq('status', status)

  return (data ?? [])
    .filter((r) => new Date(r.start_date).getFullYear() === year)
    .reduce((sum, r) => sum + Number(r.days_requested), 0)
}

export async function fetchHolidayAllowances(year = currentHolidayYear()): Promise<HolidayAllowanceRow[]> {
  const team = await fetchHolidayTeamMembers()
  const supabase = createServiceClient()

  const { data: allowanceRows } = await supabase
    .from('management_holiday_allowances')
    .select('worker_id, year, allocated_days')
    .eq('year', year)

  const byWorker = new Map(
    (allowanceRows ?? []).map((a) => [a.worker_id, Number(a.allocated_days)])
  )

  const rows: HolidayAllowanceRow[] = []
  for (const worker of team) {
    const allocated = byWorker.get(worker.id) ?? 25
    const used = await sumDaysForWorker(worker.id, year, 'approved')
    const pending = await sumDaysForWorker(worker.id, year, 'pending')
    rows.push({
      worker_id:       worker.id,
      year,
      allocated_days:  allocated,
      used_days:       used,
      pending_days:    pending,
      remaining_days:  Math.max(0, allocated - used - pending),
      worker,
    })
  }

  return rows
}

export async function fetchHolidayRequests(): Promise<HolidayRequestRow[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('management_holiday_requests')
    .select(`
      id, worker_id, start_date, end_date, days_requested, status,
      note, admin_note, created_at, reviewed_at,
      workers!management_holiday_requests_worker_id_fkey ( id, first_name, surname, role ),
      reviewer:workers!management_holiday_requests_reviewed_by_fkey ( first_name, surname )
    `)
    .order('start_date', { ascending: true })

  return (data ?? []).map((row) => ({
    id:             row.id,
    worker_id:      row.worker_id,
    start_date:     row.start_date,
    end_date:       row.end_date,
    days_requested: Number(row.days_requested),
    status:         row.status,
    note:           row.note,
    admin_note:     row.admin_note,
    created_at:     row.created_at,
    reviewed_at:    row.reviewed_at,
    worker:         relationOne(row.workers) as HolidayTeamMember,
    reviewer:       relationOne(row.reviewer),
  }))
}

export type HolidayConflict = {
  request_id: string
  worker_name: string
  start_date: string
  end_date: string
  status: string
}

export async function findHolidayConflicts(
  workerId: string,
  startDate: string,
  endDate: string,
  excludeRequestId?: string
): Promise<HolidayConflict[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('management_holiday_requests')
    .select(`
      id, worker_id, start_date, end_date, status,
      workers!management_holiday_requests_worker_id_fkey ( first_name, surname )
    `)
    .in('status', ['pending', 'approved'])
    .neq('worker_id', workerId)

  const conflicts: HolidayConflict[] = []
  for (const row of data ?? []) {
    if (excludeRequestId && row.id === excludeRequestId) continue
    if (!rangesOverlap(startDate, endDate, row.start_date, row.end_date)) continue
    const w = relationOne(row.workers) as { first_name: string; surname: string } | null
    conflicts.push({
      request_id:  row.id,
      worker_name: w ? `${w.first_name} ${w.surname}` : 'Unknown',
      start_date:  row.start_date,
      end_date:    row.end_date,
      status:      row.status,
    })
  }
  return conflicts
}

export async function validateHolidayRequest(input: {
  workerId: string
  startDate: string
  endDate: string
  excludeRequestId?: string
}) {
  const { workerId, startDate, endDate, excludeRequestId } = input
  const days = daysInclusive(startDate, endDate)
  if (days < 1) return { ok: false as const, error: 'End date must be on or after start date.' }

  const year = new Date(`${startDate}T12:00:00`).getFullYear()
  if (new Date(`${endDate}T12:00:00`).getFullYear() !== year) {
    return { ok: false as const, error: 'Holiday must fall within a single calendar year.' }
  }

  const conflicts = await findHolidayConflicts(workerId, startDate, endDate, excludeRequestId)
  if (conflicts.length > 0) {
    const names = [...new Set(conflicts.map((c) => c.worker_name))].join(', ')
    return {
      ok: false as const,
      error: `Dates clash with ${names} — another manager is already off that week.`,
      conflicts,
    }
  }

  const allowances = await fetchHolidayAllowances(year)
  const mine = allowances.find((a) => a.worker_id === workerId)
  const allocated = mine?.allocated_days ?? 25
  const used = mine?.used_days ?? 0
  const pending = mine?.pending_days ?? 0

  let pendingAdjustment = 0
  if (excludeRequestId) {
    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('management_holiday_requests')
      .select('days_requested, status')
      .eq('id', excludeRequestId)
      .maybeSingle()
    if (existing?.status === 'pending') {
      pendingAdjustment = Number(existing.days_requested)
    }
  }

  const remaining = allocated - used - pending + pendingAdjustment
  if (days > remaining) {
    return {
      ok: false as const,
      error: `Not enough days left (${remaining.toFixed(1)} remaining, ${days} requested).`,
    }
  }

  return { ok: true as const, days, year, remaining }
}

export async function countPendingHolidayRequests(): Promise<number> {
  const supabase = createServiceClient()
  const { count } = await supabase
    .from('management_holiday_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}

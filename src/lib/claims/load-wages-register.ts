import type { SupabaseClient } from '@supabase/supabase-js'
import { relationOne } from '@/lib/supabase/normalize-relations'

export type WagesRegisterRow = {
  id:              string
  workerId:        string
  surname:         string
  firstName:       string
  role:            string
  foremanId:       string | null
  foremanName:     string
  grossPay:        number
  adminFee:        number
  insuranceFee:    number
  customDeduction: number
  fees:            number
  tax:             number
  netPay:          number
  periodStart:     string | null
  periodEnd:       string | null
  dateOfPay:       string
  claimPeriodId:   string | null
}

type RawLedgerRow = {
  id:                    string
  date_of_pay:           string
  gross_pay:             number | null
  admin_fee:             number | null
  insurance_fee:         number | null
  custom_deduction:      number | null
  cis_tax_deducted:      number | null
  net_pay:               number | null
  claim_period_id:       string | null
  worker_id:             string
  workers:               { id: string; first_name: string; surname: string; role: string } | { id: string; first_name: string; surname: string; role: string }[] | null
  claim_periods:         {
    period_start: string
    period_end:   string
    foreman_id:   string | null
  } | {
    period_start: string
    period_end:   string
    foreman_id:   string | null
  }[] | null
}

function compareByName(a: WagesRegisterRow, b: WagesRegisterRow) {
  const s = a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' })
  if (s !== 0) return s
  return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
}

export async function loadWagesRegisterRows(
  supabase: SupabaseClient,
): Promise<WagesRegisterRow[]> {
  const { data, error } = await supabase
    .from('worker_cis_ledger')
    .select(`
      id, date_of_pay, gross_pay, admin_fee, insurance_fee, custom_deduction,
      cis_tax_deducted, net_pay, claim_period_id, worker_id,
      workers ( id, first_name, surname, role ),
      claim_periods ( period_start, period_end, foreman_id )
    `)
    .order('date_of_pay', { ascending: false })

  if (error) throw new Error(error.message)

  const foremanIds = new Set<string>()
  for (const row of (data ?? []) as RawLedgerRow[]) {
    const claim = relationOne(row.claim_periods)
    if (claim?.foreman_id) foremanIds.add(claim.foreman_id)
  }

  const foremanNameById = new Map<string, string>()
  if (foremanIds.size > 0) {
    const { data: foremen } = await supabase
      .from('workers')
      .select('id, first_name, surname')
      .in('id', Array.from(foremanIds))

    for (const f of foremen ?? []) {
      foremanNameById.set(f.id, `${f.first_name} ${f.surname}`)
    }
  }

  const rows: WagesRegisterRow[] = []

  for (const row of (data ?? []) as RawLedgerRow[]) {
    const worker = relationOne(row.workers)
    if (!worker) continue

    const claim = relationOne(row.claim_periods)
    const adminFee = row.admin_fee ?? 0
    const insuranceFee = row.insurance_fee ?? 0
    const customDeduction = row.custom_deduction ?? 0

    rows.push({
      id:              row.id,
      workerId:        worker.id,
      surname:         worker.surname,
      firstName:       worker.first_name,
      role:            worker.role,
      foremanId:       claim?.foreman_id ?? null,
      foremanName:     claim?.foreman_id
        ? foremanNameById.get(claim.foreman_id) ?? 'Unknown foreman'
        : '—',
      grossPay:        row.gross_pay ?? 0,
      adminFee,
      insuranceFee,
      customDeduction,
      fees:            adminFee + insuranceFee + customDeduction,
      tax:             row.cis_tax_deducted ?? 0,
      netPay:          row.net_pay ?? 0,
      periodStart:     claim?.period_start ?? null,
      periodEnd:       claim?.period_end ?? null,
      dateOfPay:       row.date_of_pay,
      claimPeriodId:   row.claim_period_id,
    })
  }

  rows.sort(compareByName)
  return rows
}

export const WAGES_ROLE_LABELS: Record<string, string> = {
  admin:       'Admin',
  foreman:     'Foreman',
  management:  'Management',
  bricklayer:  'Bricklayer',
  labourer:    'Labourer',
  apprentice:  'Apprentice',
  jetwasher:   'Jetwasher',
}

export function wagesRegisterPeriodKey(row: WagesRegisterRow): string {
  if (row.claimPeriodId) return row.claimPeriodId
  if (row.periodStart && row.periodEnd) return `${row.periodStart}|${row.periodEnd}`
  return 'unknown'
}

export function formatWagesPeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return 'Unknown period'
  const s = new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const e = new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

export type WagesRegisterFilters = {
  foremanId?: string
  role?:      string
  periodKey?: string
}

export function filterWagesRegisterRows(
  rows: WagesRegisterRow[],
  filters: WagesRegisterFilters,
): WagesRegisterRow[] {
  let result = rows
  if (filters.foremanId) {
    result = result.filter((r) => r.foremanId === filters.foremanId)
  }
  if (filters.role) {
    result = result.filter((r) => r.role === filters.role)
  }
  if (filters.periodKey) {
    result = result.filter((r) => wagesRegisterPeriodKey(r) === filters.periodKey)
  }
  return result
}

export function wagesRegisterFilterOptions(rows: WagesRegisterRow[]) {
  const foremen = new Map<string, string>()
  const roles = new Set<string>()
  const periods = new Map<string, { key: string; label: string; periodEnd: string }>()

  for (const row of rows) {
    if (row.foremanId) {
      foremen.set(row.foremanId, row.foremanName)
    }
    if (row.role) roles.add(row.role)

    const key = wagesRegisterPeriodKey(row)
    if (!periods.has(key)) {
      periods.set(key, {
        key,
        label:     formatWagesPeriodLabel(row.periodStart, row.periodEnd),
        periodEnd: row.periodEnd ?? '',
      })
    }
  }

  return {
    foremen: Array.from(foremen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    roles: Array.from(roles)
      .map((role) => ({ role, label: WAGES_ROLE_LABELS[role] ?? role }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    periods: Array.from(periods.values())
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)),
  }
}

export function wagesRegisterToSheetRows(rows: WagesRegisterRow[]) {
  return rows.map((r) => ({
    'Name':       `${r.surname}, ${r.firstName}`,
    'Role':       WAGES_ROLE_LABELS[r.role] ?? r.role,
    'Foreman':    r.foremanName,
    'Pay period': formatWagesPeriodLabel(r.periodStart, r.periodEnd),
    'Paid on':    r.dateOfPay
      ? new Date(r.dateOfPay).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '',
    'Gross':      r.grossPay,
    'Admin fee':  r.adminFee,
    'Insurance':  r.insuranceFee,
    'Other fees': r.customDeduction,
    'Total fees': r.fees,
    'CIS tax':    r.tax,
    'Net pay':    r.netPay,
  }))
}

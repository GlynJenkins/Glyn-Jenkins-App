import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLedgerPayeeSnapshot } from '@/lib/cis/ledger-payee'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  listFortnightOptions,
  toLocalDateString,
  type PayCycleSettings,
} from '@/lib/fortnight'

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
  nationalInsurance: number
  netPay:          number
  periodStart:     string | null
  periodEnd:       string | null
  dateOfPay:       string
  claimPeriodId:   string | null
  payeeSortCode:      string | null
  payeeAccountNumber: string | null
}

type RawLedgerRow = {
  id:                    string
  date_of_pay:           string
  gross_pay:             number | null
  admin_fee:             number | null
  insurance_fee:         number | null
  custom_deduction:      number | null
  cis_tax_deducted:      number | null
  national_insurance:    number | null
  net_pay:               number | null
  claim_period_id:       string | null
  worker_id:             string
  payee_sort_code:       string | null
  payee_account_number:  string | null
  workers:               { id: string; first_name: string; surname: string; role: string; bank_sort_code?: string | null; bank_account_number?: string | null } | { id: string; first_name: string; surname: string; role: string; bank_sort_code?: string | null; bank_account_number?: string | null }[] | null
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

export function isApprenticeEmployed(role: string) {
  return role === 'apprentice'
}

export function computeRegisterNet(
  gross: number,
  fees: number,
  tax: number,
  nationalInsurance: number,
): number {
  return Math.round((gross - fees - tax - nationalInsurance) * 100) / 100
}

function compareByName(a: WagesRegisterRow, b: WagesRegisterRow) {
  const s = a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' })
  if (s !== 0) return s
  return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
}

const LEDGER_SELECT_WITH_NI = `
  id, date_of_pay, gross_pay, admin_fee, insurance_fee, custom_deduction,
  cis_tax_deducted, national_insurance, net_pay, claim_period_id, worker_id,
  payee_sort_code, payee_account_number,
  workers ( id, first_name, surname, role, bank_sort_code, bank_account_number ),
  claim_periods ( period_start, period_end, foreman_id )
`

const LEDGER_SELECT_LEGACY = `
  id, date_of_pay, gross_pay, admin_fee, insurance_fee, custom_deduction,
  cis_tax_deducted, net_pay, claim_period_id, worker_id,
  payee_sort_code, payee_account_number,
  workers ( id, first_name, surname, role, bank_sort_code, bank_account_number ),
  claim_periods ( period_start, period_end, foreman_id )
`

const LEDGER_SELECT_WITHOUT_PAYEE = `
  id, date_of_pay, gross_pay, admin_fee, insurance_fee, custom_deduction,
  cis_tax_deducted, national_insurance, net_pay, claim_period_id, worker_id,
  workers ( id, first_name, surname, role, bank_sort_code, bank_account_number ),
  claim_periods ( period_start, period_end, foreman_id )
`

const LEDGER_SELECT_LEGACY_WITHOUT_PAYEE = `
  id, date_of_pay, gross_pay, admin_fee, insurance_fee, custom_deduction,
  cis_tax_deducted, net_pay, claim_period_id, worker_id,
  workers ( id, first_name, surname, role, bank_sort_code, bank_account_number ),
  claim_periods ( period_start, period_end, foreman_id )
`

function isMissingNationalInsuranceColumn(message: string) {
  return /national_insurance/i.test(message)
}

function isMissingPayeeColumn(message: string) {
  return /payee_sort_code|payee_account_number/i.test(message)
}

function resolvePayeeBank(
  row: RawLedgerRow,
  worker: { first_name: string; surname: string; bank_sort_code?: string | null; bank_account_number?: string | null },
) {
  if (row.payee_sort_code && row.payee_account_number) {
    return {
      payeeSortCode:      row.payee_sort_code,
      payeeAccountNumber: row.payee_account_number,
    }
  }

  const snap = buildLedgerPayeeSnapshot({
    first_name:           worker.first_name,
    surname:              worker.surname,
    bank_sort_code:       worker.bank_sort_code,
    bank_account_number:  worker.bank_account_number,
  })

  return {
    payeeSortCode:      snap.payee_sort_code,
    payeeAccountNumber: snap.payee_account_number,
  }
}

export type WagesRegisterLoadResult = {
  rows:              WagesRegisterRow[]
  niColumnAvailable: boolean
}

export async function loadWagesRegisterResult(
  supabase: SupabaseClient,
): Promise<WagesRegisterLoadResult> {
  let niColumnAvailable = true
  let rawRows: RawLedgerRow[] = []

  const primary = await supabase
    .from('worker_cis_ledger')
    .select(LEDGER_SELECT_WITH_NI)
    .order('date_of_pay', { ascending: false })

  if (primary.error && isMissingPayeeColumn(primary.error.message)) {
    const withoutPayee = await supabase
      .from('worker_cis_ledger')
      .select(LEDGER_SELECT_WITHOUT_PAYEE)
      .order('date_of_pay', { ascending: false })
    if (withoutPayee.error && isMissingNationalInsuranceColumn(withoutPayee.error.message)) {
      const legacy = await supabase
        .from('worker_cis_ledger')
        .select(LEDGER_SELECT_LEGACY_WITHOUT_PAYEE)
        .order('date_of_pay', { ascending: false })
      if (legacy.error) throw new Error(legacy.error.message)
      rawRows = (legacy.data ?? []) as RawLedgerRow[]
      niColumnAvailable = false
    } else {
      if (withoutPayee.error) throw new Error(withoutPayee.error.message)
      rawRows = (withoutPayee.data ?? []) as RawLedgerRow[]
    }
  } else if (primary.error && isMissingNationalInsuranceColumn(primary.error.message)) {
    niColumnAvailable = false
    const retry = await supabase
      .from('worker_cis_ledger')
      .select(LEDGER_SELECT_LEGACY)
      .order('date_of_pay', { ascending: false })
    if (retry.error && isMissingPayeeColumn(retry.error.message)) {
      const legacy = await supabase
        .from('worker_cis_ledger')
        .select(LEDGER_SELECT_LEGACY_WITHOUT_PAYEE)
        .order('date_of_pay', { ascending: false })
      if (legacy.error) throw new Error(legacy.error.message)
      rawRows = (legacy.data ?? []) as RawLedgerRow[]
    } else {
      if (retry.error) throw new Error(retry.error.message)
      rawRows = (retry.data ?? []) as RawLedgerRow[]
    }
  } else {
    if (primary.error) throw new Error(primary.error.message)
    rawRows = (primary.data ?? []) as RawLedgerRow[]
  }

  const foremanIds = new Set<string>()
  for (const row of rawRows) {
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

  for (const row of rawRows) {
    const worker = relationOne(row.workers)
    if (!worker) continue

    const claim = relationOne(row.claim_periods)
    const adminFee = row.admin_fee ?? 0
    const insuranceFee = row.insurance_fee ?? 0
    const customDeduction = row.custom_deduction ?? 0
    const tax = row.cis_tax_deducted ?? 0
    const nationalInsurance = row.national_insurance ?? 0
    const fees = adminFee + insuranceFee + customDeduction
    const payee = resolvePayeeBank(row, worker)

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
      fees,
      tax,
      nationalInsurance,
      netPay:          row.net_pay ?? computeRegisterNet(row.gross_pay ?? 0, fees, tax, nationalInsurance),
      periodStart:     claim?.period_start ?? null,
      periodEnd:       claim?.period_end ?? null,
      dateOfPay:       row.date_of_pay,
      claimPeriodId:   row.claim_period_id,
      payeeSortCode:      payee.payeeSortCode,
      payeeAccountNumber: payee.payeeAccountNumber,
    })
  }

  rows.sort(compareByName)
  return { rows, niColumnAvailable }
}

export async function loadWagesRegisterRows(
  supabase: SupabaseClient,
): Promise<WagesRegisterRow[]> {
  const { rows } = await loadWagesRegisterResult(supabase)
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
  if (row.periodStart && row.periodEnd) return `${row.periodStart}|${row.periodEnd}`
  if (row.claimPeriodId) return row.claimPeriodId
  return 'unknown'
}

export function rowMatchesPeriodKey(row: WagesRegisterRow, periodKey: string): boolean {
  if (periodKey === 'all') return true
  return wagesRegisterPeriodKey(row) === periodKey
}

export type WagesFortnightTab = {
  key:       string
  start:     string
  end:       string
  label:     string
  periodEnd: string
  rowCount:  number
}

export function buildWagesFortnightTabs(
  settings: PayCycleSettings | null,
  rows: WagesRegisterRow[],
  at = new Date(),
  count = 52,
): WagesFortnightTab[] {
  const tabMap = new Map<string, WagesFortnightTab>()

  for (const period of listFortnightOptions(count, settings, at)) {
    const start = toLocalDateString(period.start)
    const end = toLocalDateString(period.end)
    const key = `${start}|${end}`
    tabMap.set(key, {
      key,
      start,
      end,
      label:     formatWagesPeriodLabel(start, end),
      periodEnd: end,
      rowCount:  0,
    })
  }

  for (const row of rows) {
    if (!row.periodStart || !row.periodEnd) continue
    const key = `${row.periodStart}|${row.periodEnd}`
    if (!tabMap.has(key)) {
      tabMap.set(key, {
        key,
        start:     row.periodStart,
        end:       row.periodEnd,
        label:     formatWagesPeriodLabel(row.periodStart, row.periodEnd),
        periodEnd: row.periodEnd,
        rowCount:  0,
      })
    }
  }

  for (const row of rows) {
    const key = wagesRegisterPeriodKey(row)
    const tab = tabMap.get(key)
    if (tab) tab.rowCount += 1
  }

  return Array.from(tabMap.values()).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
}

export function defaultWagesPeriodKey(tabs: WagesFortnightTab[]): string {
  return tabs[0]?.key ?? 'all'
}

export function claimPeriodKey(periodStart: string, periodEnd: string): string {
  return `${periodStart}|${periodEnd}`
}

export function buildClaimFortnightTabs(
  settings: PayCycleSettings | null,
  claims: { period_start: string; period_end: string }[],
  at = new Date(),
  count = 52,
): WagesFortnightTab[] {
  const tabMap = new Map<string, WagesFortnightTab>()

  for (const period of listFortnightOptions(count, settings, at)) {
    const start = toLocalDateString(period.start)
    const end = toLocalDateString(period.end)
    const key = `${start}|${end}`
    tabMap.set(key, {
      key,
      start,
      end,
      label:     formatWagesPeriodLabel(start, end),
      periodEnd: end,
      rowCount:  0,
    })
  }

  for (const claim of claims) {
    const key = claimPeriodKey(claim.period_start, claim.period_end)
    if (!tabMap.has(key)) {
      tabMap.set(key, {
        key,
        start:     claim.period_start,
        end:       claim.period_end,
        label:     formatWagesPeriodLabel(claim.period_start, claim.period_end),
        periodEnd: claim.period_end,
        rowCount:  0,
      })
    }
  }

  for (const claim of claims) {
    const tab = tabMap.get(claimPeriodKey(claim.period_start, claim.period_end))
    if (tab) tab.rowCount += 1
  }

  return Array.from(tabMap.values()).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
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
    result = result.filter((r) => rowMatchesPeriodKey(r, filters.periodKey!))
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
    if (!periods.has(key) && row.periodStart && row.periodEnd) {
      periods.set(key, {
        key,
        label:     formatWagesPeriodLabel(row.periodStart, row.periodEnd),
        periodEnd: row.periodEnd,
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
    'Name':               `${r.surname}, ${r.firstName}`,
    'Role':               WAGES_ROLE_LABELS[r.role] ?? r.role,
    'Foreman':            r.foremanName,
    'Pay period':         formatWagesPeriodLabel(r.periodStart, r.periodEnd),
    'Paid on':            r.dateOfPay
      ? new Date(r.dateOfPay).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '',
    'Gross':              r.grossPay,
    'Admin fee':          r.adminFee,
    'Insurance':          r.insuranceFee,
    'Other fees':         r.customDeduction,
    'Total fees':         r.fees,
    'Tax / CIS':          r.tax,
    'National Insurance': isApprenticeEmployed(r.role) ? r.nationalInsurance : '',
    'Net pay':            r.netPay,
  }))
}

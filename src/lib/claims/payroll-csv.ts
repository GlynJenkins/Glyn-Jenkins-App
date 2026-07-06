import { formatWagesPeriodLabel, type WagesRegisterRow } from '@/lib/claims/load-wages-register'

export type WorkerBankDetails = {
  sortCode:      string | null
  accountNumber: string | null
}

export type PayrollCsvRow = {
  payee:         string
  sortCode:      string
  accountNumber: string
  amount:        number
  reference:     string
}

export type PayrollCsvSkipped = {
  workerId: string
  payee:    string
  reason:   string
}

export type PayrollCsvBuildResult = {
  rows:     PayrollCsvRow[]
  skipped:  PayrollCsvSkipped[]
  totalNet: number
}

const REFERENCE_MAX = 18

function csvCell(value: string | number): string {
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function payeeName(row: WagesRegisterRow): string {
  return `${row.firstName} ${row.surname}`.trim()
}

function payrollReference(row: WagesRegisterRow): string {
  const label = formatWagesPeriodLabel(row.periodStart, row.periodEnd)
  const ref = label === 'Unknown period' ? 'GJ Payroll' : `GJ ${label}`
  return ref.length > REFERENCE_MAX ? ref.slice(0, REFERENCE_MAX) : ref
}

function normalizeSortCode(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 6) return null
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

function normalizeAccountNumber(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length === 8 ? digits : null
}

type AggregatedPayment = {
  row:     WagesRegisterRow
  netPay:  number
  periods: Set<string>
}

function aggregatePaymentsByWorker(rows: WagesRegisterRow[]): AggregatedPayment[] {
  const byWorker = new Map<string, AggregatedPayment>()

  for (const row of rows) {
    const periodKey = row.periodStart && row.periodEnd
      ? `${row.periodStart}|${row.periodEnd}`
      : 'unknown'
    const existing = byWorker.get(row.workerId)
    if (existing) {
      existing.netPay += row.netPay
      existing.periods.add(periodKey)
    } else {
      byWorker.set(row.workerId, {
        row,
        netPay: row.netPay,
        periods: new Set([periodKey]),
      })
    }
  }

  return Array.from(byWorker.values()).sort((a, b) =>
    payeeName(a.row).localeCompare(payeeName(b.row), undefined, { sensitivity: 'base' }),
  )
}

function referenceForAggregate(entry: AggregatedPayment): string {
  if (entry.periods.size === 1) return payrollReference(entry.row)
  const ref = 'GJ Multi-period'
  return ref.length > REFERENCE_MAX ? ref.slice(0, REFERENCE_MAX) : ref
}

export function buildPayrollCsvRows(
  registerRows: WagesRegisterRow[],
  bankByWorkerId: Map<string, WorkerBankDetails>,
): PayrollCsvBuildResult {
  const payments = aggregatePaymentsByWorker(registerRows)
  const rows: PayrollCsvRow[] = []
  const skipped: PayrollCsvSkipped[] = []
  let totalNet = 0

  for (const entry of payments) {
    const payee = payeeName(entry.row)
    const bank = bankByWorkerId.get(entry.row.workerId)
    const sortCode = normalizeSortCode(bank?.sortCode ?? null)
    const accountNumber = normalizeAccountNumber(bank?.accountNumber ?? null)
    const amount = Math.round(entry.netPay * 100) / 100

    if (!sortCode || !accountNumber) {
      skipped.push({
        workerId: entry.row.workerId,
        payee,
        reason:   'Missing or invalid bank details',
      })
      continue
    }

    if (amount <= 0) {
      skipped.push({
        workerId: entry.row.workerId,
        payee,
        reason:   'Net pay is zero',
      })
      continue
    }

    rows.push({
      payee,
      sortCode,
      accountNumber,
      amount,
      reference: referenceForAggregate(entry),
    })
    totalNet += amount
  }

  totalNet = Math.round(totalNet * 100) / 100
  return { rows, skipped, totalNet }
}

export function payrollCsvContent(result: PayrollCsvBuildResult): string {
  const lines = [
    ['Payee', 'Sort Code', 'Account Number', 'Amount', 'Reference'].map(csvCell).join(','),
    ...result.rows.map((r) =>
      [r.payee, r.sortCode, r.accountNumber, r.amount.toFixed(2), r.reference]
        .map(csvCell)
        .join(','),
    ),
  ]
  return lines.join('\r\n') + '\r\n'
}

export function payrollExportFilename(periodEnd?: string | null): string {
  const suffix = (periodEnd ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  return `payroll-${suffix}.csv`
}

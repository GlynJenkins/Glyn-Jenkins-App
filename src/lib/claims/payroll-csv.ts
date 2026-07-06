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
  bankReady:     boolean
  note:          string
}

export type PayrollCsvBuildResult = {
  rows:          PayrollCsvRow[]
  bankReadyCount: number
  needsBankCount: number
  totalNet:      number
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

export function normalizeSortCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 6) return null
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

export function normalizeAccountNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 8) return null
  return digits.padStart(8, '0')
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
): PayrollCsvBuildResult {
  const payments = aggregatePaymentsByWorker(registerRows)
  const rows: PayrollCsvRow[] = []
  let bankReadyCount = 0
  let needsBankCount = 0
  let totalNet = 0

  for (const entry of payments) {
    const payee = payeeName(entry.row)
    const sortCode = entry.row.payeeSortCode
    const accountNumber = entry.row.payeeAccountNumber
    const amount = Math.round(entry.netPay * 100) / 100
    const bankReady = !!sortCode && !!accountNumber && amount > 0

    let note = ''
    if (amount <= 0) {
      note = 'Zero net pay'
    } else if (!sortCode || !accountNumber) {
      note = 'No bank details on registration — worker must complete /induction'
      needsBankCount += 1
    } else {
      bankReadyCount += 1
    }

    rows.push({
      payee,
      sortCode:      sortCode ?? '',
      accountNumber: accountNumber ?? '',
      amount,
      reference:     referenceForAggregate(entry),
      bankReady,
      note,
    })
    totalNet += amount
  }

  totalNet = Math.round(totalNet * 100) / 100
  return { rows, bankReadyCount, needsBankCount, totalNet }
}

export function payrollCsvContent(result: PayrollCsvBuildResult): string {
  const lines = [
    ['Payee', 'Sort Code', 'Account Number', 'Amount', 'Reference', 'Note'].map(csvCell).join(','),
    ...result.rows.map((r) =>
      [
        r.payee,
        r.sortCode,
        r.accountNumber,
        r.amount.toFixed(2),
        r.reference,
        r.note,
      ].map(csvCell).join(','),
    ),
  ]
  // UTF-8 BOM helps Numbers/Excel open comma-separated columns correctly.
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

export function payrollExportFilename(periodEnd?: string | null): string {
  const suffix = (periodEnd ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  return `payroll-${suffix}.csv`
}

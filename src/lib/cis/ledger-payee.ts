import { normalizeAccountNumber, normalizeSortCode } from '@/lib/claims/payroll-csv'

type WorkerBankSource = {
  first_name?:            string | null
  surname?:               string | null
  bank_sort_code?:        string | null
  bank_account_number?:   string | null
}

export function buildLedgerPayeeSnapshot(worker: WorkerBankSource) {
  const sortCode = normalizeSortCode(worker.bank_sort_code)
  const accountNumber = normalizeAccountNumber(worker.bank_account_number)
  const name = [worker.first_name, worker.surname].filter(Boolean).join(' ').trim()

  return {
    payee_name:             name || null,
    payee_sort_code:        sortCode,
    payee_account_number:   accountNumber,
  }
}

export function workerHasPayeeBank(worker: WorkerBankSource): boolean {
  const snap = buildLedgerPayeeSnapshot(worker)
  return !!snap.payee_sort_code && !!snap.payee_account_number
}

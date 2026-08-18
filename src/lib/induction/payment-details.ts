/** Shared bank / UTR / NI validation for induction and admin payment edits. */

import {
  normalizeAccountNumber,
  normalizeSortCode,
} from '@/lib/claims/payroll-csv'

export type PaymentDetailsInput = {
  bankSortCode?:      string
  bankAccountNumber?: string
  utrNumber?:         string
  niNumber?:          string
}

export type PaymentDetailsNormalized = {
  bank_sort_code?:      string
  bank_account_number?: string
  utr_number?:          string
  ni_number?:           string
}

export type PaymentDetailsParseOk = {
  ok: true
  values: PaymentDetailsNormalized
  masks: {
    bankSortCode?:      string
    bankAccountNumber?: string
    utrNumber?:         string
    niNumber?:          string
  }
}

export type PaymentDetailsParseErr = { ok: false; error: string }

/** Mask to last 4 characters — never expose full stored values to the client. */
export function maskLast4(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (v.length <= 4) return v
  return `••••${v.slice(-4)}`
}

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Validate optional payment-detail fields for an admin PATCH.
 * Only provided (non-empty) fields are included. Bank fields must arrive as a pair.
 */
export function parsePaymentDetailsUpdate(
  input: PaymentDetailsInput | null | undefined,
): PaymentDetailsParseOk | PaymentDetailsParseErr {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Payment details are required.' }
  }

  const sortRaw = hasText(input.bankSortCode) ? input.bankSortCode.trim() : ''
  const acctRaw = hasText(input.bankAccountNumber) ? input.bankAccountNumber.trim() : ''
  const utrRaw  = hasText(input.utrNumber) ? input.utrNumber.trim() : ''
  const niRaw   = hasText(input.niNumber) ? input.niNumber.trim().toUpperCase() : ''

  const hasSort = sortRaw.length > 0
  const hasAcct = acctRaw.length > 0
  const hasUtr  = utrRaw.length > 0
  const hasNi   = niRaw.length > 0

  if (!hasSort && !hasAcct && !hasUtr && !hasNi) {
    return { ok: false, error: 'Enter at least one payment detail to update.' }
  }

  if (hasSort !== hasAcct) {
    return { ok: false, error: 'Enter the sort code and account number together.' }
  }

  const values: PaymentDetailsNormalized = {}
  const masks: PaymentDetailsParseOk['masks'] = {}

  if (hasSort && hasAcct) {
    const sortCode = normalizeSortCode(sortRaw)
    if (!sortCode) {
      return { ok: false, error: 'Sort code must be 6 digits (e.g. 12-34-56).' }
    }
    const accountNumber = normalizeAccountNumber(acctRaw)
    // Induction requires exactly 8 digits — keep admin aligned (reject padded short numbers).
    const acctDigits = acctRaw.replace(/\D/g, '')
    if (acctDigits.length !== 8 || !accountNumber) {
      return { ok: false, error: 'Account number must be exactly 8 digits.' }
    }
    values.bank_sort_code = sortCode
    values.bank_account_number = accountNumber
    masks.bankSortCode = maskLast4(sortCode)
    masks.bankAccountNumber = maskLast4(accountNumber)
  }

  if (hasUtr) {
    if (!/^\d{10}$/.test(utrRaw)) {
      return { ok: false, error: 'UTR number must be exactly 10 digits.' }
    }
    values.utr_number = utrRaw
    masks.utrNumber = maskLast4(utrRaw)
  }

  if (hasNi) {
    if (!/^[A-Z]{2}\d{6}[A-D]$/i.test(niRaw)) {
      return { ok: false, error: 'Enter a valid NI number (e.g. AB123456C).' }
    }
    values.ni_number = niRaw.toUpperCase()
    masks.niNumber = maskLast4(values.ni_number)
  }

  return { ok: true, values, masks }
}

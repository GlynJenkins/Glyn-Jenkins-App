export type PayWorker = {
  id: string
  tax_type: string | null
  has_personal_insurance?: boolean | null
  role?: string | null
}

export type PayLine = {
  gross: number
  adminFee: number
  insuranceFee: number
  customDeduction: number
  cisTax: number
  net: number
}

/** Management and apprentices are employed — no CIS admin or insurance fees. */
export function isEmployedWorker(role: string | null | undefined) {
  return role === 'management' || role === 'apprentice'
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculatePayLine(
  gross: number,
  worker: PayWorker,
  fees: { adminFee: number; insuranceFee: number },
  customDeduction = 0,
): PayLine {
  const employed = isEmployedWorker(worker.role)

  // Deductions are capped in sequence to what can actually come out of the
  // gross, so the recorded figures always reconcile: gross − deductions ≥ 0.
  const safeGross = isFinite(gross) ? Math.max(0, gross) : 0
  const adminFee = employed ? 0 : Math.min(fees.adminFee, safeGross)
  const insuranceFee = employed
    ? 0
    : worker.has_personal_insurance
      ? 0
      : Math.min(fees.insuranceFee, safeGross - adminFee)
  const safeCustom = isFinite(customDeduction) ? Math.max(0, customDeduction) : 0
  const cappedCustom = round2(Math.min(safeCustom, safeGross - adminFee - insuranceFee))

  const taxable = safeGross - adminFee - insuranceFee - cappedCustom
  const cisTax = worker.tax_type === 'cis_20'
    ? round2(taxable * 0.2)
    : 0
  const net = round2(taxable - cisTax)

  return {
    gross: safeGross,
    adminFee,
    insuranceFee,
    customDeduction: cappedCustom,
    cisTax,
    net,
  }
}

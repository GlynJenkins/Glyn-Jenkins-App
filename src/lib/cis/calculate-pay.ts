export type PayWorker = {
  id: string
  tax_type: string | null
  has_personal_insurance?: boolean | null
}

export type PayLine = {
  gross: number
  adminFee: number
  insuranceFee: number
  customDeduction: number
  cisTax: number
  net: number
}

export function calculatePayLine(
  gross: number,
  worker: PayWorker,
  fees: { adminFee: number; insuranceFee: number },
  customDeduction = 0,
): PayLine {
  const adminFee = fees.adminFee
  const insuranceFee = worker.has_personal_insurance ? 0 : fees.insuranceFee
  const taxable = Math.max(0, gross - adminFee - insuranceFee - customDeduction)
  const cisTax = worker.tax_type === 'cis_20'
    ? Math.round(taxable * 0.2 * 100) / 100
    : 0
  const net = Math.round((taxable - cisTax) * 100) / 100

  return {
    gross,
    adminFee,
    insuranceFee,
    customDeduction,
    cisTax,
    net,
  }
}

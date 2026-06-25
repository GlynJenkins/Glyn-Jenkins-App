import { MATERIAL_UPLIFT_PERCENT } from '@/lib/variations/rates'

export type DeveloperSubmissionStatus = 'draft' | 'submitted' | 'agreed' | 'paid'
export type DeveloperPaymentStatus = 'unpaid' | 'paid'

export type DeveloperLineInput = {
  id: string
  developer_hours: number
  developer_rate_per_hour: number
}

export type DeveloperExtraLineInput = {
  worker_role: string
  developer_hours: number
  developer_rate_per_hour: number
}

export function lineTotal(hours: number, rate: number): number {
  return Math.round(hours * rate * 100) / 100
}

export function sumDeveloperTotal(
  lines: { developer_hours: number | null; developer_rate_per_hour: number | null }[]
): number {
  return lines.reduce(
    (sum, line) =>
      sum + lineTotal(line.developer_hours ?? 0, line.developer_rate_per_hour ?? 0),
    0
  )
}

export function materialUpliftAmount(workersSubtotal: number): number {
  return Math.round(workersSubtotal * MATERIAL_UPLIFT_PERCENT) / 100
}

export function computeDeveloperTotals(
  claimLines: { developer_hours: number | null; developer_rate_per_hour: number | null }[],
  extraLines: { developer_hours: number | null; developer_rate_per_hour: number | null }[],
  materialUpliftEnabled: boolean
) {
  const workersSubtotal = sumDeveloperTotal([...claimLines, ...extraLines])
  const uplift = materialUpliftEnabled ? materialUpliftAmount(workersSubtotal) : 0
  return {
    workersSubtotal,
    materialUpliftAmount: uplift,
    developerTotal: Math.round((workersSubtotal + uplift) * 100) / 100,
  }
}

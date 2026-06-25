export type DeveloperSubmissionStatus = 'draft' | 'submitted' | 'agreed' | 'paid'
export type DeveloperPaymentStatus = 'unpaid' | 'paid'

export type DeveloperLineInput = {
  id: string
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

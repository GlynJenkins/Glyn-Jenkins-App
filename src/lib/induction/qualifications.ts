/** Trade / training qualification options collected at enrolment (all roles). */
export const TRADE_QUALIFICATIONS = [
  'NVQ 1',
  'NVQ 2',
  'NVQ 3',
  'City and Guilds',
  'In training (Apprentice)',
  'N/A Labourer',
  'N/A Other',
] as const

export type TradeQualification = (typeof TRADE_QUALIFICATIONS)[number]

export function isTradeQualification(value: string): value is TradeQualification {
  return (TRADE_QUALIFICATIONS as readonly string[]).includes(value)
}

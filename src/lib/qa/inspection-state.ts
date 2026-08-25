export const QA_INSPECTION_STATES = [
  'passed',
  'failed_open',
  'awaiting_reinspection',
] as const

export type QaInspectionState = (typeof QA_INSPECTION_STATES)[number]

export function isQaInspectionState(value: unknown): value is QaInspectionState {
  return typeof value === 'string' && (QA_INSPECTION_STATES as readonly string[]).includes(value)
}

/** Grid traffic-light: whose court the ball is in. */
export function qaCellTone(state: QaInspectionState | null | undefined):
  | 'none'
  | 'passed'
  | 'failed_open'
  | 'awaiting_reinspection' {
  if (!state) return 'none'
  return state
}

export function qaStateLabel(state: QaInspectionState): string {
  switch (state) {
    case 'passed':
      return 'Passed'
    case 'failed_open':
      return 'With foreman'
    case 'awaiting_reinspection':
      return 'Awaiting re-inspection'
  }
}

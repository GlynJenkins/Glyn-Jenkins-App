export const RTW_METHODS = ['passport', 'share_code', 'no_passport_manual'] as const
export type RightToWorkMethod = (typeof RTW_METHODS)[number]

export const RTW_STATUSES = ['pending', 'verified', 'follow_up'] as const
export type RightToWorkStatus = (typeof RTW_STATUSES)[number]

export function isRightToWorkMethod(value: unknown): value is RightToWorkMethod {
  return typeof value === 'string' && (RTW_METHODS as readonly string[]).includes(value)
}

export function isRightToWorkStatus(value: unknown): value is RightToWorkStatus {
  return typeof value === 'string' && (RTW_STATUSES as readonly string[]).includes(value)
}

/** Basic Home Office share-code shape: ~9 alphanumeric chars (often starts with W). */
export function normalizeShareCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidShareCode(raw: string): boolean {
  const code = normalizeShareCode(raw)
  return /^[A-Z0-9]{8,12}$/.test(code)
}

export function rtwStatusLabel(status: RightToWorkStatus | string | null | undefined): string {
  switch (status) {
    case 'verified':
      return 'Verified'
    case 'follow_up':
      return 'Follow-up'
    case 'pending':
    default:
      return 'Pending'
  }
}

export function rtwMethodLabel(method: RightToWorkMethod | string | null | undefined): string {
  switch (method) {
    case 'passport':
      return 'Passport'
    case 'share_code':
      return 'Share code'
    case 'no_passport_manual':
      return 'Manual check'
    default:
      return 'Not set'
  }
}

export const GOV_UK_VIEW_RIGHT_TO_WORK = 'https://www.gov.uk/view-right-to-work'

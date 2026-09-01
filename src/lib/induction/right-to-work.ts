export const RTW_METHODS = ['passport', 'share_code', 'no_passport_manual'] as const
export type RightToWorkMethod = (typeof RTW_METHODS)[number]

export const RTW_STATUSES = ['pending', 'verified', 'follow_up'] as const
export type RightToWorkStatus = (typeof RTW_STATUSES)[number]

export const RTW_TYPES = ['continuous', 'time_limited'] as const
export type RightToWorkType = (typeof RTW_TYPES)[number]

export const RTW_CHECK_OUTCOMES = ['verified', 'follow_up', 'rejected'] as const
export type RightToWorkCheckOutcome = (typeof RTW_CHECK_OUTCOMES)[number]

/** Days before expiry that count as "re-check due soon". */
export const RTW_EXPIRING_SOON_DAYS = 30

export function isRightToWorkMethod(value: unknown): value is RightToWorkMethod {
  return typeof value === 'string' && (RTW_METHODS as readonly string[]).includes(value)
}

export function isRightToWorkStatus(value: unknown): value is RightToWorkStatus {
  return typeof value === 'string' && (RTW_STATUSES as readonly string[]).includes(value)
}

export function isRightToWorkType(value: unknown): value is RightToWorkType {
  return typeof value === 'string' && (RTW_TYPES as readonly string[]).includes(value)
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

export function rtwTypeLabel(type: RightToWorkType | string | null | undefined): string {
  switch (type) {
    case 'continuous':
      return 'Continuous'
    case 'time_limited':
      return 'Time-limited'
    default:
      return '—'
  }
}

export type RtwExpiryFlag = 'ok' | 'expiring_soon' | 'expired' | 'none'

/** Classify a time-limited expiry date relative to today (local calendar day). */
export function classifyRtwExpiry(
  type: string | null | undefined,
  expiry: string | null | undefined,
  today = new Date(),
): RtwExpiryFlag {
  if (type !== 'time_limited' || !expiry) return 'none'
  const day = expiry.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'none'

  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  if (day < todayStr) return 'expired'

  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  limit.setDate(limit.getDate() + RTW_EXPIRING_SOON_DAYS)
  const limitStr = [
    limit.getFullYear(),
    String(limit.getMonth() + 1).padStart(2, '0'),
    String(limit.getDate()).padStart(2, '0'),
  ].join('-')

  if (day <= limitStr) return 'expiring_soon'
  return 'ok'
}

export function formatRtwDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const day = isoDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—'
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatRtwDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const GOV_UK_VIEW_RIGHT_TO_WORK = 'https://www.gov.uk/view-right-to-work'

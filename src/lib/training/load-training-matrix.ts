import { createServiceClient } from '@/lib/supabase/server'
import { WAGES_ROLE_LABELS } from '@/lib/claims/load-wages-register'

/** CSCS cards expiring within this many days are flagged amber. */
export const CSCS_EXPIRING_SOON_DAYS = 60

export type CscsStatus = 'missing' | 'expired' | 'expiring_soon' | 'valid'
export type HsStatus = 'on_file' | 'na' | 'not_provided'

export type TrainingMatrixRow = {
  id: string
  name: string
  trade: string
  role: string
  qualification: string
  cscsNumber: string | null
  cscsExpiryDate: string | null
  cscsStatus: CscsStatus
  hsStatus: HsStatus
  hsQualificationUrl: string | null
  createdAt: string
}

export type TrainingMatrixSummary = {
  total: number
  expired: number
  expiringSoon: number
  valid: number
  missing: number
  hsMissing: number
}

function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

function parseDateOnly(iso: string): Date {
  // Store dates as YYYY-MM-DD; parse as UTC midnight to avoid TZ drift.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function computeCscsStatus(
  cscsNumber: string | null | undefined,
  cscsExpiryDate: string | null | undefined,
  today: Date = startOfTodayUtc(),
): CscsStatus {
  const number = (cscsNumber ?? '').trim()
  const expiry = (cscsExpiryDate ?? '').trim()
  if (!number || !expiry) return 'missing'

  const expiryDate = parseDateOnly(expiry)
  if (Number.isNaN(expiryDate.getTime())) return 'missing'

  if (expiryDate.getTime() < today.getTime()) return 'expired'

  const soonMs = CSCS_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  if (expiryDate.getTime() <= today.getTime() + soonMs) return 'expiring_soon'

  return 'valid'
}

export function computeHsStatus(
  hsUrl: string | null | undefined,
  hsNa: boolean | null | undefined,
): HsStatus {
  if (hsUrl) return 'on_file'
  if (hsNa) return 'na'
  return 'not_provided'
}

export function formatCscsExpiry(iso: string | null): string {
  if (!iso) return '—'
  const d = parseDateOnly(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function cscsStatusLabel(status: CscsStatus): string {
  switch (status) {
    case 'expired':        return 'Expired'
    case 'expiring_soon':  return 'Expiring soon'
    case 'valid':          return 'Valid'
    case 'missing':        return 'Not provided'
  }
}

export function hsStatusLabel(status: HsStatus): string {
  switch (status) {
    case 'on_file':       return 'On file'
    case 'na':            return 'N/A'
    case 'not_provided':  return 'Not provided'
  }
}

export async function loadTrainingMatrix(): Promise<{
  rows: TrainingMatrixRow[]
  summary: TrainingMatrixSummary
}> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('workers')
    .select(`
      id,
      first_name,
      surname,
      role,
      cscs_number,
      cscs_expiry_date,
      bricklayer_qualification,
      hs_qualification_url,
      hs_qualification_na,
      created_at
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error

  const today = startOfTodayUtc()

  const rows: TrainingMatrixRow[] = (data ?? []).map((w) => {
    const cscsStatus = computeCscsStatus(w.cscs_number, w.cscs_expiry_date, today)
    const hsStatus = computeHsStatus(w.hs_qualification_url, w.hs_qualification_na)
    return {
      id:                 w.id,
      name:               `${w.first_name} ${w.surname}`.trim(),
      trade:              WAGES_ROLE_LABELS[w.role] ?? w.role,
      role:               w.role,
      qualification:      (w.bricklayer_qualification ?? '').trim() || '—',
      cscsNumber:         w.cscs_number?.trim() || null,
      cscsExpiryDate:     w.cscs_expiry_date ?? null,
      cscsStatus,
      hsStatus,
      hsQualificationUrl: w.hs_qualification_url ?? null,
      createdAt:          w.created_at,
    }
  })

  const summary: TrainingMatrixSummary = {
    total:        rows.length,
    expired:      rows.filter((r) => r.cscsStatus === 'expired').length,
    expiringSoon: rows.filter((r) => r.cscsStatus === 'expiring_soon').length,
    valid:        rows.filter((r) => r.cscsStatus === 'valid').length,
    missing:      rows.filter((r) => r.cscsStatus === 'missing').length,
    hsMissing:    rows.filter((r) => r.hsStatus === 'not_provided').length,
  }

  return { rows, summary }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { WAGES_ROLE_LABELS } from '@/lib/claims/load-wages-register'
import {
  classifyRtwExpiry,
  formatRtwDate,
  formatRtwDateTime,
  rtwMethodLabel,
  rtwStatusLabel,
  rtwTypeLabel,
  type RtwExpiryFlag,
} from '@/lib/induction/right-to-work'

export type RtwRegisterFilter =
  | 'all'
  | 'verified'
  | 'pending'
  | 'follow_up'
  | 'expiring'
  | 'expired'

export type RtwCheckHistoryItem = {
  id: string
  checkedBy: string
  checkedAt: string
  method: string | null
  outcome: string
  note: string | null
}

export type RtwRegisterRow = {
  id: string
  name: string
  firstName: string
  surname: string
  role: string
  roleLabel: string
  workerStatus: string
  homeAddress: string | null
  method: string | null
  methodLabel: string
  documentUrl: string | null
  shareCode: string | null
  rtwStatus: string
  statusLabel: string
  verifiedBy: string | null
  verifiedAt: string | null
  verifiedAtLabel: string
  rtwType: string | null
  rtwTypeLabel: string
  expiry: string | null
  expiryLabel: string
  expiryFlag: RtwExpiryFlag
  checks: RtwCheckHistoryItem[]
}

export type RtwRegisterSummary = {
  total: number
  verified: number
  pending: number
  followUp: number
  expiringSoon: number
  expired: number
}

export type RtwRegisterBundle = {
  rows: RtwRegisterRow[]
  summary: RtwRegisterSummary
}

function mapCheck(raw: {
  id: string
  checked_by: string
  checked_at: string
  method: string | null
  outcome: string
  note: string | null
}): RtwCheckHistoryItem {
  return {
    id: raw.id,
    checkedBy: raw.checked_by,
    checkedAt: raw.checked_at,
    method: raw.method,
    outcome: raw.outcome,
    note: raw.note,
  }
}

export async function loadRightToWorkRegister(
  supabase: SupabaseClient,
): Promise<RtwRegisterBundle> {
  const { data, error } = await supabase
    .from('workers')
    .select(`
      id, first_name, surname, role, status, home_address,
      right_to_work_method, right_to_work_document_url, id_document_url,
      right_to_work_share_code, right_to_work_status,
      right_to_work_verified_at, right_to_work_verified_by,
      right_to_work_type, right_to_work_expiry
    `)
    .in('status', ['active', 'pending_verification'])
    .order('surname', { ascending: true })

  if (error) {
    if (/right_to_work/i.test(error.message) || error.code === 'PGRST204') {
      throw new Error('Right to work columns are missing. Run add_right_to_work.sql first.')
    }
    throw new Error(`Failed to load right-to-work register: ${error.message}`)
  }

  const workerIds = (data ?? []).map((w) => w.id)
  const checksByWorker = new Map<string, RtwCheckHistoryItem[]>()

  if (workerIds.length > 0) {
    const { data: checks, error: checksError } = await supabase
      .from('right_to_work_checks')
      .select('id, worker_id, checked_by, checked_at, method, outcome, note')
      .in('worker_id', workerIds)
      .order('checked_at', { ascending: false })

    if (checksError) {
      if (!/right_to_work_checks|schema cache|PGRST/i.test(checksError.message)
        && checksError.code !== 'PGRST205'
        && checksError.code !== '42P01') {
        console.warn('[rtw-register] check history unavailable:', checksError.message)
      }
    } else {
      for (const c of checks ?? []) {
        const list = checksByWorker.get(c.worker_id) ?? []
        list.push(mapCheck(c))
        checksByWorker.set(c.worker_id, list)
      }
    }
  }

  const rows: RtwRegisterRow[] = (data ?? []).map((w) => {
    const rtwStatus = w.right_to_work_status ?? 'pending'
    const rtwType = w.right_to_work_type ?? null
    const expiry = w.right_to_work_expiry
      ? String(w.right_to_work_expiry).slice(0, 10)
      : null
    const expiryFlag = classifyRtwExpiry(rtwType, expiry)

    return {
      id: w.id,
      firstName: w.first_name,
      surname: w.surname,
      name: `${w.first_name} ${w.surname}`.trim(),
      role: w.role,
      roleLabel: WAGES_ROLE_LABELS[w.role] ?? w.role,
      workerStatus: w.status,
      homeAddress: w.home_address?.trim() || null,
      method: w.right_to_work_method ?? null,
      methodLabel: rtwMethodLabel(w.right_to_work_method),
      documentUrl: w.right_to_work_document_url || w.id_document_url || null,
      shareCode: w.right_to_work_share_code ?? null,
      rtwStatus,
      statusLabel: rtwStatusLabel(rtwStatus),
      verifiedBy: w.right_to_work_verified_by ?? null,
      verifiedAt: w.right_to_work_verified_at ?? null,
      verifiedAtLabel: formatRtwDateTime(w.right_to_work_verified_at),
      rtwType,
      rtwTypeLabel: rtwTypeLabel(rtwType),
      expiry,
      expiryLabel: formatRtwDate(expiry),
      expiryFlag,
      checks: checksByWorker.get(w.id) ?? [],
    }
  })

  rows.sort((a, b) => {
    const bySurname = a.surname.localeCompare(b.surname, 'en', { sensitivity: 'base' })
    if (bySurname !== 0) return bySurname
    return a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' })
  })

  const summary: RtwRegisterSummary = {
    total: rows.length,
    verified: rows.filter((r) => r.rtwStatus === 'verified').length,
    pending: rows.filter((r) => r.rtwStatus === 'pending' || !r.rtwStatus).length,
    followUp: rows.filter((r) => r.rtwStatus === 'follow_up').length,
    expiringSoon: rows.filter((r) => r.expiryFlag === 'expiring_soon').length,
    expired: rows.filter((r) => r.expiryFlag === 'expired').length,
  }

  return { rows, summary }
}

export function filterRtwRegisterRows(
  rows: RtwRegisterRow[],
  filter: RtwRegisterFilter,
  query: string,
): RtwRegisterRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => {
    if (filter === 'verified' && r.rtwStatus !== 'verified') return false
    if (filter === 'pending' && r.rtwStatus !== 'pending') return false
    if (filter === 'follow_up' && r.rtwStatus !== 'follow_up') return false
    if (filter === 'expiring' && r.expiryFlag !== 'expiring_soon') return false
    if (filter === 'expired' && r.expiryFlag !== 'expired') return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q)
      || r.surname.toLowerCase().includes(q)
      || r.firstName.toLowerCase().includes(q)
      || r.roleLabel.toLowerCase().includes(q)
    )
  })
}

export function rtwRegisterToSheetRows(rows: RtwRegisterRow[]) {
  return rows.map((r) => ({
    Name: r.name,
    Role: r.roleLabel,
    Address: r.homeAddress ?? '',
    Method: r.methodLabel,
    Status: r.statusLabel,
    'Verified by': r.verifiedBy ?? '',
    'Verified date/time': r.verifiedAt
      ? new Date(r.verifiedAt).toLocaleString('en-GB')
      : '',
    'RTW type': r.rtwTypeLabel === '—' ? '' : r.rtwTypeLabel,
    'Re-check by': r.expiry ?? '',
  }))
}

export async function countRtwExpiringSoon(supabase: SupabaseClient): Promise<number> {
  try {
    const { summary } = await loadRightToWorkRegister(supabase)
    return summary.expiringSoon + summary.expired
  } catch {
    return 0
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatWagesPeriodLabel } from '@/lib/claims/load-wages-register'

export type ForemanClaimHistoryItem = {
  id:           string
  status:       string
  poolTotal:    number
  periodStart:  string
  periodEnd:    string
  periodLabel:  string
  periodKey:    string
  workerCount:  number
  submittedAt:  string | null
}

export function foremanClaimPeriodKey(periodStart: string, periodEnd: string): string {
  return `${periodStart}|${periodEnd}`
}

export async function loadForemanClaimHistory(
  supabase: SupabaseClient,
  foremanId: string,
): Promise<ForemanClaimHistoryItem[]> {
  const { data, error } = await supabase
    .from('claim_periods')
    .select(`
      id, status, pool_total, period_start, period_end, submitted_at,
      claim_allocations ( id )
    `)
    .eq('foreman_id', foremanId)
    .order('period_end', { ascending: false })
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id:          row.id,
    status:      row.status,
    poolTotal:   row.pool_total ?? 0,
    periodStart: row.period_start,
    periodEnd:   row.period_end,
    periodLabel: formatWagesPeriodLabel(row.period_start, row.period_end),
    periodKey:   foremanClaimPeriodKey(row.period_start, row.period_end),
    workerCount: row.claim_allocations?.length ?? 0,
    submittedAt: row.submitted_at,
  }))
}

export function filterPastForemanClaims(
  claims: ForemanClaimHistoryItem[],
  currentPeriodKey: string,
): ForemanClaimHistoryItem[] {
  return claims.filter((c) => c.periodKey !== currentPeriodKey)
}

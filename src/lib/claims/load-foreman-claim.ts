import type { SupabaseClient } from '@supabase/supabase-js'
import { relationOne } from '@/lib/supabase/normalize-relations'

export type ForemanClaimPoolItem = {
  type:      string
  label:     string
  amount:    number
  siteName?: string
  fullValue?: number
}

export type ForemanClaimAllocation = {
  id:           string
  worker_id:    string
  gross_amount: number
  workers:      {
    id:                string
    first_name:        string
    surname:           string
    role:              string
    tax_type:          string
    has_own_insurance: boolean | null
  } | null
}

export type ForemanClaimDetail = {
  id:               string
  status:           string
  pool_total:       number
  pool_items:       ForemanClaimPoolItem[]
  period_start:     string
  period_end:       string
  submitted_at:     string | null
  approved_at:      string | null
  rejected_at:      string | null
  rejection_reason: string | null
  siteName:         string
  allocations:      ForemanClaimAllocation[]
}

export async function loadForemanClaim(
  supabase: SupabaseClient,
  claimId: string,
  foremanId: string,
): Promise<ForemanClaimDetail | null> {
  const { data: claimBase } = await supabase
    .from('claim_periods')
    .select(`
      id, status, pool_total, pool_items, period_start, period_end,
      submitted_at, approved_at, rejected_at, rejection_reason,
      foreman_id, site_id,
      sites ( id, name ),
      claim_allocations ( id, worker_id, gross_amount )
    `)
    .eq('id', claimId)
    .maybeSingle()

  if (!claimBase || claimBase.foreman_id !== foremanId) return null

  const enrichedAllocations = await Promise.all(
    (claimBase.claim_allocations ?? []).map(async (alloc) => {
      const { data: worker } = await supabase
        .from('workers')
        .select('id, first_name, surname, role, tax_type, has_personal_insurance')
        .eq('id', alloc.worker_id)
        .maybeSingle()
      return {
        ...alloc,
        workers: worker
          ? {
              ...worker,
              has_own_insurance: worker.has_personal_insurance ?? false,
            }
          : null,
      }
    }),
  )

  const site = relationOne(claimBase.sites)
  const poolItems = (claimBase.pool_items ?? []) as ForemanClaimPoolItem[]
  const siteNames = [
    ...new Set(poolItems.map((p) => p.siteName).filter(Boolean)),
  ] as string[]

  let siteName = site?.name ?? 'Multi-site claim'
  if (!site && siteNames.length === 1) siteName = siteNames[0]!
  if (!site && siteNames.length > 1) siteName = `${siteNames.length} sites`

  return {
    id:               claimBase.id,
    status:           claimBase.status,
    pool_total:       claimBase.pool_total ?? 0,
    pool_items:       poolItems,
    period_start:     claimBase.period_start,
    period_end:       claimBase.period_end,
    submitted_at:     claimBase.submitted_at,
    approved_at:      claimBase.approved_at,
    rejected_at:      claimBase.rejected_at,
    rejection_reason: claimBase.rejection_reason,
    siteName,
    allocations:      enrichedAllocations,
  }
}

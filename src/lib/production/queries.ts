import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeClaimsByForemanPeriod } from '@/lib/claims/dedupe-period-claims'
import {
  buildProductionCostReport,
  type CostClaim,
  type PoolItem,
  type ProductionCostReport,
} from './monthly-costs'

type RawClaim = {
  id:           string
  site_id:      string | null
  foreman_id:   string
  period_start: string
  period_end:   string
  submitted_at: string | null
  status:       string
  pool_items:   PoolItem[] | null
  claim_allocations: { gross_amount: number | null }[] | null
}

function mapClaims(rows: RawClaim[]): CostClaim[] {
  return rows.map((c) => ({
    id:           c.id,
    site_id:      c.site_id,
    period_start: c.period_start,
    period_end:   c.period_end,
    pool_items:   c.pool_items,
    gross_wages:  (c.claim_allocations ?? []).reduce(
      (sum, a) => sum + (a.gross_amount ?? 0),
      0,
    ),
  }))
}

function collectLookupKeys(claims: CostClaim[]) {
  const cellIds = new Set<string>()
  const variationKeys = new Set<string>()
  const claimIds: string[] = []

  for (const claim of claims) {
    claimIds.push(claim.id)
    if (claim.site_id) continue
    for (const item of claim.pool_items ?? []) {
      if (item.type === 'grid_cell') cellIds.add(item.id)
      if (item.type === 'variation') variationKeys.add(item.id)
    }
  }

  return { cellIds, variationKeys, claimIds }
}

async function resolveCellSites(
  supabase: SupabaseClient,
  cellIds: Set<string>,
): Promise<Map<string, string>> {
  const cellSiteById = new Map<string, string>()
  if (cellIds.size === 0) return cellSiteById

  const ids = Array.from(cellIds)
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data: cells } = await supabase
      .from('price_grid')
      .select('id, site_id')
      .in('id', chunk)
    for (const cell of cells ?? []) {
      cellSiteById.set(cell.id, cell.site_id)
    }
  }

  return cellSiteById
}

async function resolveVariationSites(
  supabase: SupabaseClient,
  variationKeys: Set<string>,
  claimIds: string[],
): Promise<Map<string, string>> {
  const variationSiteByKey = new Map<string, string>()
  if (variationKeys.size === 0 || claimIds.length === 0) return variationSiteByKey

  const { data: variations } = await supabase
    .from('variation_claims')
    .select('id, site_id, photo_urls, claimed_in_period_id')
    .in('claimed_in_period_id', claimIds)

  for (const v of variations ?? []) {
    const key = (v.photo_urls ?? [])[0] ?? v.id
    if (variationKeys.has(key)) {
      variationSiteByKey.set(key, v.site_id)
    }
    if (variationKeys.has(v.id)) {
      variationSiteByKey.set(v.id, v.site_id)
    }
  }

  return variationSiteByKey
}

export async function fetchProductionCostReport(
  supabase: SupabaseClient,
  monthCount = 12,
): Promise<ProductionCostReport> {
  const { data: sites } = await supabase
    .from('sites')
    .select('id, name')
    .order('name')

  const { data: rawClaims, error } = await supabase
    .from('claim_periods')
    .select(`
      id, site_id, foreman_id, period_start, period_end, submitted_at, status, pool_items,
      claim_allocations ( gross_amount )
    `)
    .in('status', ['approved', 'pending'])
    .order('period_start', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (rawClaims ?? []) as RawClaim[]
  const approvedClaims = mapClaims(rows.filter((c) => c.status === 'approved'))
  const pendingClaims = mapClaims(
    dedupeClaimsByForemanPeriod(rows.filter((c) => c.status === 'pending')),
  )

  const allClaims = [...approvedClaims, ...pendingClaims]
  const { cellIds, variationKeys, claimIds } = collectLookupKeys(allClaims)

  const [cellSiteById, variationSiteByKey] = await Promise.all([
    resolveCellSites(supabase, cellIds),
    resolveVariationSites(supabase, variationKeys, claimIds),
  ])

  return buildProductionCostReport(
    sites ?? [],
    approvedClaims,
    pendingClaims,
    cellSiteById,
    variationSiteByKey,
    monthCount,
  )
}

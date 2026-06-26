import type { SupabaseClient } from '@supabase/supabase-js'

export type ClaimPoolItem = {
  type:   string
  id:     string
  amount: number
  siteId?: string
}

const APPRENTICE_TYPES = new Set([
  'apprentice_college',
  'apprentice_holiday',
  'college',
  'holiday',
])

async function fetchCellSiteMap(
  supabase: SupabaseClient,
  cellIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!cellIds.length) return map

  for (let i = 0; i < cellIds.length; i += 200) {
    const chunk = cellIds.slice(i, i + 200)
    const { data } = await supabase
      .from('price_grid')
      .select('id, site_id')
      .in('id', chunk)
    for (const cell of data ?? []) {
      map.set(cell.id, cell.site_id)
    }
  }

  return map
}

async function fetchVariationSiteMap(
  supabase: SupabaseClient,
  claimId: string,
  variationKeys: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!variationKeys.length) return map

  const { data: variations } = await supabase
    .from('variation_claims')
    .select('id, site_id, photo_urls')
    .eq('claimed_in_period_id', claimId)

  for (const v of variations ?? []) {
    const key = (v.photo_urls ?? [])[0] ?? v.id
    if (variationKeys.includes(key)) map.set(key, v.site_id)
    if (variationKeys.includes(v.id)) map.set(v.id, v.site_id)
  }

  return map
}

function dominantSiteFromPool(
  poolItems: ClaimPoolItem[],
  cellSiteById: Map<string, string>,
  variationSiteByKey: Map<string, string>,
): string | null {
  const siteAmounts = new Map<string, number>()
  let assignedPool = 0
  let apprenticePool = 0

  for (const item of poolItems) {
    const amt = item.amount ?? 0
    if (amt <= 0) continue

    if (item.type === 'grid_cell') {
      const siteId = cellSiteById.get(item.id) ?? item.siteId
      if (siteId) {
        siteAmounts.set(siteId, (siteAmounts.get(siteId) ?? 0) + amt)
        assignedPool += amt
      }
    } else if (item.type === 'variation') {
      const siteId = variationSiteByKey.get(item.id)
      if (siteId) {
        siteAmounts.set(siteId, (siteAmounts.get(siteId) ?? 0) + amt)
        assignedPool += amt
      }
    } else if (APPRENTICE_TYPES.has(item.type)) {
      apprenticePool += amt
    }
  }

  if (apprenticePool > 0 && assignedPool > 0) {
    for (const [siteId, amt] of siteAmounts) {
      siteAmounts.set(siteId, amt + apprenticePool * (amt / assignedPool))
    }
  }

  let bestSite: string | null = null
  let bestAmount = 0
  for (const [siteId, amt] of siteAmounts) {
    if (amt > bestAmount) {
      bestSite = siteId
      bestAmount = amt
    }
  }

  return bestSite
}

async function fallbackForemanSite(
  supabase: SupabaseClient,
  foremanId: string | null | undefined,
): Promise<string | null> {
  if (!foremanId) return null

  const { data, error } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foremanId)
    .order('site_id')
    .limit(1)

  if (error) return null
  return data?.[0]?.site_id ?? null
}

/** Resolve a non-null site_id for CIS ledger rows on single- and multi-site claims. */
export async function resolveClaimLedgerSiteId(
  supabase: SupabaseClient,
  claim: {
    id:         string
    site_id:    string | null
    foreman_id?: string | null
    pool_items: ClaimPoolItem[] | null
  },
): Promise<string | null> {
  if (claim.site_id) return claim.site_id

  const poolItems = (claim.pool_items ?? []).filter((i) => (i.amount ?? 0) > 0)
  if (poolItems.length) {
    const cellIds = poolItems.filter((i) => i.type === 'grid_cell').map((i) => i.id)
    const variationKeys = poolItems.filter((i) => i.type === 'variation').map((i) => i.id)

    const [cellSiteById, variationSiteByKey] = await Promise.all([
      fetchCellSiteMap(supabase, cellIds),
      fetchVariationSiteMap(supabase, claim.id, variationKeys),
    ])

    const dominant = dominantSiteFromPool(poolItems, cellSiteById, variationSiteByKey)
    if (dominant) return dominant
  }

  // Any variation linked to this claim period
  const { data: linkedVariation } = await supabase
    .from('variation_claims')
    .select('site_id')
    .eq('claimed_in_period_id', claim.id)
    .not('site_id', 'is', null)
    .limit(1)

  if (linkedVariation?.[0]?.site_id) {
    return linkedVariation[0].site_id
  }

  return fallbackForemanSite(supabase, claim.foreman_id)
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { roundMoney } from '@/lib/production/monthly-costs'

const PAGE = 1000

export type CostToCompleteSite = {
  siteId: string
  siteName: string
  siteTotal: number
  claimed: number
  remaining: number
  pctComplete: number
}

export type CostToCompleteReport = {
  sites: CostToCompleteSite[]
  grandSiteTotal: number
  grandClaimed: number
  grandRemaining: number
}

type CellRow = {
  contract_value: number | null
  total_claimed_pct: number | null
}

async function loadSiteCells(
  supabase: SupabaseClient,
  siteId: string,
): Promise<CellRow[]> {
  const all: CellRow[] = []
  let from = 0
  while (true) {
    const { data: page, error } = await supabase
      .from('price_grid')
      .select('contract_value, total_claimed_pct')
      .eq('site_id', siteId)
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!page || page.length === 0) break
    all.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

export function computeCostToCompleteFromCells(
  cells: CellRow[],
): Omit<CostToCompleteSite, 'siteId' | 'siteName'> {
  let siteTotal = 0
  let claimed = 0

  for (const cell of cells) {
    const value = Number(cell.contract_value ?? 0)
    if (!Number.isFinite(value) || value === 0) continue
    const pct = Math.min(100, Math.max(0, Number(cell.total_claimed_pct ?? 0)))
    siteTotal += value
    claimed += value * (pct / 100)
  }

  siteTotal = roundMoney(siteTotal)
  claimed = roundMoney(claimed)
  const remaining = roundMoney(Math.max(0, siteTotal - claimed))
  const pctComplete = siteTotal > 0 ? roundMoney((claimed / siteTotal) * 100) : 0

  return { siteTotal, claimed, remaining, pctComplete }
}

/** Cost to complete for every active site, plus grand totals. */
export async function loadCostToComplete(
  supabase: SupabaseClient = createServiceClient(),
): Promise<CostToCompleteReport> {
  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  const rows: CostToCompleteSite[] = []
  for (const site of sites ?? []) {
    const cells = await loadSiteCells(supabase, site.id)
    const stats = computeCostToCompleteFromCells(cells)
    rows.push({
      siteId:   site.id,
      siteName: site.name,
      ...stats,
    })
  }

  const grandSiteTotal = roundMoney(rows.reduce((s, r) => s + r.siteTotal, 0))
  const grandClaimed = roundMoney(rows.reduce((s, r) => s + r.claimed, 0))
  const grandRemaining = roundMoney(rows.reduce((s, r) => s + r.remaining, 0))

  return { sites: rows, grandSiteTotal, grandClaimed, grandRemaining }
}

/** Cost to complete for a single site. */
export async function loadSiteCostToComplete(
  siteId: string,
  siteName: string,
  supabase: SupabaseClient = createServiceClient(),
): Promise<CostToCompleteSite> {
  const cells = await loadSiteCells(supabase, siteId)
  return {
    siteId,
    siteName,
    ...computeCostToCompleteFromCells(cells),
  }
}

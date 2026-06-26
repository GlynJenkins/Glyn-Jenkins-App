export type PoolItem = {
  type:   string
  id:     string
  amount: number
  siteId?: string
}

export type CostClaim = {
  id:           string
  site_id:      string | null
  period_start: string
  period_end:   string
  pool_items:   PoolItem[] | null
  gross_wages:  number
}

/** @deprecated Use CostClaim */
export type ApprovedClaim = CostClaim

export type SiteMonthlyRow = {
  siteId:            string
  siteName:          string
  byMonth:           Record<string, number>
  monthlyAvg:        number
  total:             number
  pendingByMonth:    Record<string, number>
  pendingMonthlyAvg: number
  pendingTotal:      number
}

export type ProductionCostReport = {
  months:              string[]
  monthLabels:         Record<string, string>
  sites:               SiteMonthlyRow[]
  totalsByMonth:       Record<string, number>
  overallAvg:          number
  grandTotal:          number
  pendingTotalsByMonth: Record<string, number>
  pendingOverallAvg:   number
  pendingGrandTotal:   number
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Spread wages across calendar months using booking-window days.
 * A fortnight with 7 days in each month receives a 50/50 split automatically.
 */
export function allocateWagesToMonths(
  periodStart: string,
  periodEnd: string,
  amount: number,
): Record<string, number> {
  if (amount <= 0) return {}

  const start  = parseIsoDate(periodStart)
  const end    = parseIsoDate(periodEnd)
  const counts: Record<string, number> = {}
  let totalDays = 0

  for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
    const key = monthKey(cur)
    counts[key] = (counts[key] ?? 0) + 1
    totalDays++
  }

  if (totalDays === 0) return {}

  const result: Record<string, number> = {}
  for (const [key, days] of Object.entries(counts)) {
    result[key] = roundMoney((amount * days) / totalDays)
  }

  const sum = Object.values(result).reduce((a, b) => a + b, 0)
  const drift = roundMoney(amount - sum)
  if (drift !== 0) {
    const first = Object.keys(result)[0]
    if (first) result[first] = roundMoney((result[first] ?? 0) + drift)
  }

  return result
}

const APPRENTICE_TYPES = new Set([
  'apprentice_college',
  'apprentice_holiday',
  'college',
  'holiday',
])

/** Resolve each site's share of wages from pool items (0–1 per site, sums to 1). */
export function resolveSiteShares(
  claim: CostClaim,
  cellSiteById: Map<string, string>,
  variationSiteByKey: Map<string, string>,
): Map<string, number> {
  const shares = new Map<string, number>()

  if (claim.site_id) {
    shares.set(claim.site_id, 1)
    return shares
  }

  const items = (claim.pool_items ?? []).filter((i) => (i.amount ?? 0) > 0)
  if (!items.length) return shares

  const siteAmounts = new Map<string, number>()
  let assignedPool = 0
  let apprenticePool = 0

  for (const item of items) {
    const amt = item.amount ?? 0
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
    assignedPool += apprenticePool
  }

  const poolSum = Array.from(siteAmounts.values()).reduce((a, b) => a + b, 0)
  if (poolSum <= 0) return shares

  for (const [siteId, amt] of siteAmounts) {
    shares.set(siteId, amt / poolSum)
  }

  return shares
}

function listRecentMonths(count: number, at = new Date()): string[] {
  const months: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(at.getFullYear(), at.getMonth() - i, 1, 12, 0, 0, 0)
    months.push(monthKey(d))
  }
  return months
}

function averageNonZero(values: number[]): number {
  const nonZero = values.filter((v) => v > 0)
  if (!nonZero.length) return 0
  return roundMoney(nonZero.reduce((a, b) => a + b, 0) / nonZero.length)
}

function emptyMonthMap(months: string[]): Record<string, number> {
  return Object.fromEntries(months.map((m) => [m, 0]))
}

function aggregateClaimsToSiteMonths(
  sites: { id: string; name: string }[],
  claims: CostClaim[],
  months: string[],
  cellSiteById: Map<string, string>,
  variationSiteByKey: Map<string, string>,
): Map<string, Record<string, number>> {
  const bySiteMonth = new Map<string, Record<string, number>>()
  for (const site of sites) {
    bySiteMonth.set(site.id, emptyMonthMap(months))
  }

  for (const claim of claims) {
    if (claim.gross_wages <= 0) continue

    const shares = resolveSiteShares(claim, cellSiteById, variationSiteByKey)
    if (!shares.size) continue

    for (const [siteId, fraction] of shares) {
      const siteWages = roundMoney(claim.gross_wages * fraction)
      const split = allocateWagesToMonths(claim.period_start, claim.period_end, siteWages)
      const row = bySiteMonth.get(siteId)
      if (!row) continue

      for (const [month, amount] of Object.entries(split)) {
        if (months.includes(month)) {
          row[month] = roundMoney((row[month] ?? 0) + amount)
        }
      }
    }
  }

  return bySiteMonth
}

function buildSiteRows(
  sites: { id: string; name: string }[],
  months: string[],
  approvedBySite: Map<string, Record<string, number>>,
  pendingBySite: Map<string, Record<string, number>>,
): SiteMonthlyRow[] {
  return sites.map((site) => {
    const byMonth = approvedBySite.get(site.id) ?? emptyMonthMap(months)
    const pendingByMonth = pendingBySite.get(site.id) ?? emptyMonthMap(months)
    const values = months.map((m) => byMonth[m] ?? 0)
    const pendingValues = months.map((m) => pendingByMonth[m] ?? 0)

    return {
      siteId:            site.id,
      siteName:          site.name,
      byMonth,
      monthlyAvg:        averageNonZero(values),
      total:             roundMoney(values.reduce((a, b) => a + b, 0)),
      pendingByMonth,
      pendingMonthlyAvg: averageNonZero(pendingValues),
      pendingTotal:      roundMoney(pendingValues.reduce((a, b) => a + b, 0)),
    }
  }).sort((a, b) => b.total + b.pendingTotal - (a.total + a.pendingTotal))
}

function sumByMonth(
  siteRows: SiteMonthlyRow[],
  months: string[],
  field: 'byMonth' | 'pendingByMonth',
): Record<string, number> {
  const totals = emptyMonthMap(months)
  for (const site of siteRows) {
    for (const m of months) {
      totals[m] = roundMoney((totals[m] ?? 0) + (site[field][m] ?? 0))
    }
  }
  return totals
}

export function buildProductionCostReport(
  sites: { id: string; name: string }[],
  approvedClaims: CostClaim[],
  pendingClaims: CostClaim[],
  cellSiteById: Map<string, string>,
  variationSiteByKey: Map<string, string>,
  monthCount = 12,
): ProductionCostReport {
  const months = listRecentMonths(monthCount)
  const monthLabels = Object.fromEntries(months.map((m) => [m, formatMonthLabel(m)]))

  const approvedBySite = aggregateClaimsToSiteMonths(
    sites,
    approvedClaims,
    months,
    cellSiteById,
    variationSiteByKey,
  )
  const pendingBySite = aggregateClaimsToSiteMonths(
    sites,
    pendingClaims,
    months,
    cellSiteById,
    variationSiteByKey,
  )

  const siteRows = buildSiteRows(sites, months, approvedBySite, pendingBySite)
  const totalsByMonth = sumByMonth(siteRows, months, 'byMonth')
  const pendingTotalsByMonth = sumByMonth(siteRows, months, 'pendingByMonth')

  return {
    months,
    monthLabels,
    sites: siteRows,
    totalsByMonth,
    overallAvg: averageNonZero(months.map((m) => totalsByMonth[m] ?? 0)),
    grandTotal: roundMoney(siteRows.reduce((a, s) => a + s.total, 0)),
    pendingTotalsByMonth,
    pendingOverallAvg: averageNonZero(months.map((m) => pendingTotalsByMonth[m] ?? 0)),
    pendingGrandTotal: roundMoney(siteRows.reduce((a, s) => a + s.pendingTotal, 0)),
  }
}

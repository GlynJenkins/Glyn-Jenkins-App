import type { SupabaseClient } from '@supabase/supabase-js'
import { getForemanSiteIds } from '@/lib/auth/foreman-sites'

export type ClaimPoolItem = {
  type:       string
  id:         string
  label:      string
  amount:     number
  fullValue?: number
  siteId?:    string
  siteName?:  string
}

export type ApprenticeDaysEntry = {
  workerId:    string
  collegeDays: number
  holidayDays: number
}

export type ValidatedClaimPool = {
  ok: true
  /** Pool items with grid amounts/fullValues replaced by database values. */
  sanitizedPoolItems: ClaimPoolItem[]
  /** Server-computed pool total — never the client's number. */
  computedPoolTotal: number
  collegeDayRate: number
  holidayDayRate: number
}

export type ClaimPoolError = { ok: false; status: number; error: string }

const round2 = (n: number) => Math.round(n * 100) / 100
const APPRENTICE_HOLIDAY_ALLOWANCE_DAYS = 28

function isValidAmount(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n) && n > 0
}

function isValidDays(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n) && n >= 0
}

/**
 * Recompute and verify every money figure in a claim on the server (review C1/H2).
 *
 * - Grid cells: must exist, belong to a site assigned to this foreman, and the
 *   claimed amount must fit within the cell's remaining unclaimed value.
 * - Variations: must exist, be approved, unclaimed, on an assigned site, and
 *   belong to this foreman.
 * - Apprentice days: priced at the configured server rates; holiday days are
 *   checked against the remaining annual balance.
 * - Allocations must sum to the recomputed pool total to the penny.
 */
export async function validateClaimPool(
  supabase: SupabaseClient,
  opts: {
    foremanId:      string
    poolItems:      ClaimPoolItem[]
    allocations:    { workerId: string; grossAmount: number }[]
    apprenticeDays: ApprenticeDaysEntry[]
    variationIds:   string[]
  },
): Promise<ValidatedClaimPool | ClaimPoolError> {
  const { foremanId, poolItems, allocations, apprenticeDays, variationIds } = opts

  const assignedSites = new Set(await getForemanSiteIds(foremanId))
  if (assignedSites.size === 0) {
    return { ok: false, status: 403, error: 'No sites are assigned to you.' }
  }

  // ── Grid cells ─────────────────────────────────────────────────────────
  const gridItems = poolItems.filter((p) => p.type === 'grid_cell')
  const cellIds   = gridItems.map((i) => i.id).filter(Boolean)

  if (new Set(cellIds).size !== gridItems.length) {
    return { ok: false, status: 400, error: 'Duplicate grid cells in claim.' }
  }

  const cellById = new Map<string, { site_id: string; contract_value: number | null; total_claimed_pct: number | null }>()
  if (cellIds.length > 0) {
    const { data: cells, error } = await supabase
      .from('price_grid')
      .select('id, site_id, contract_value, total_claimed_pct')
      .in('id', cellIds)
    if (error) return { ok: false, status: 500, error: 'Could not verify claim items.' }
    for (const c of cells ?? []) cellById.set(c.id, c)
  }

  let gridTotal = 0
  const sanitizedPoolItems: ClaimPoolItem[] = []

  for (const item of poolItems) {
    if (item.type !== 'grid_cell') { sanitizedPoolItems.push(item); continue }

    const cell = cellById.get(item.id)
    if (!cell) {
      return { ok: false, status: 400, error: `Claim item "${item.label}" no longer exists on the price grid.` }
    }
    if (!assignedSites.has(cell.site_id)) {
      return { ok: false, status: 403, error: `Claim item "${item.label}" is on a site not assigned to you.` }
    }
    if (!isValidAmount(item.amount)) {
      return { ok: false, status: 400, error: `Claim item "${item.label}" has an invalid amount.` }
    }

    const fullValue      = cell.contract_value ?? 0
    const claimedPct     = cell.total_claimed_pct ?? 0
    const remainingValue = fullValue * (100 - claimedPct) / 100

    if (item.amount > remainingValue + 0.01) {
      return {
        ok: false, status: 400,
        error: `Claim item "${item.label}" exceeds the remaining unclaimed value (£${round2(remainingValue).toFixed(2)}).`,
      }
    }

    gridTotal += item.amount
    // Store database truth, not client values — reversal on withdraw/reject uses these.
    sanitizedPoolItems.push({ ...item, amount: round2(item.amount), fullValue, siteId: cell.site_id })
  }

  // ── Variations ─────────────────────────────────────────────────────────
  let variationTotal = 0
  const uniqueVariationIds = [...new Set(variationIds ?? [])]

  if (uniqueVariationIds.length > 0) {
    const fullSelect   = 'id, total_amount, site_id, status, claimed_in_period_id, foreman_id, assigned_foreman_id, is_lump_sum'
    const legacySelect = 'id, total_amount, site_id, status, claimed_in_period_id, foreman_id'

    let rows: Record<string, unknown>[] | null = null
    const full = await supabase.from('variation_claims').select(fullSelect).in('id', uniqueVariationIds)
    rows = full.data
    if (full.error) {
      const legacy = await supabase.from('variation_claims').select(legacySelect).in('id', uniqueVariationIds)
      if (legacy.error) return { ok: false, status: 500, error: 'Could not verify variations.' }
      rows = legacy.data
    }

    if ((rows ?? []).length !== uniqueVariationIds.length) {
      return { ok: false, status: 400, error: 'One or more variations no longer exist.' }
    }

    for (const v of rows ?? []) {
      if (v.status !== 'approved') {
        return { ok: false, status: 400, error: 'A variation in this claim is not approved.' }
      }
      if (v.claimed_in_period_id != null) {
        return { ok: false, status: 409, error: 'A variation in this claim has already been claimed.' }
      }
      if (!assignedSites.has(v.site_id as string)) {
        return { ok: false, status: 403, error: 'A variation in this claim is on a site not assigned to you.' }
      }

      const isLumpSum = !!(v.is_lump_sum as boolean | undefined)
      const assigned  = (v.assigned_foreman_id as string | null) ?? null
      const owner     = (v.foreman_id as string | null) ?? null
      const owned = isLumpSum
        ? (assigned ? assigned === foremanId : !owner || owner === foremanId)
        : owner === foremanId
      if (!owned) {
        return { ok: false, status: 403, error: 'A variation in this claim belongs to another foreman.' }
      }

      variationTotal += Number(v.total_amount ?? 0)
    }
  }

  // ── Apprentice days (server rates + holiday balance) ───────────────────
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('holiday_day_rate, college_day_rate')
    .limit(1)
    .maybeSingle()

  const holidayDayRate = settings?.holiday_day_rate ?? 50
  const collegeDayRate = settings?.college_day_rate ?? 50

  let apprenticeTotal = 0
  for (const entry of apprenticeDays ?? []) {
    const collegeDays = entry.collegeDays ?? 0
    const holidayDays = entry.holidayDays ?? 0
    if (!isValidDays(collegeDays) || !isValidDays(holidayDays)) {
      return { ok: false, status: 400, error: 'Invalid apprentice day values.' }
    }

    if (holidayDays > 0) {
      const { data: ledger } = await supabase
        .from('apprentice_holiday_ledger')
        .select('days')
        .eq('worker_id', entry.workerId)
        .eq('day_type', 'holiday')
      const used      = (ledger ?? []).reduce((sum, r) => sum + (r.days ?? 0), 0)
      const remaining = Math.max(0, APPRENTICE_HOLIDAY_ALLOWANCE_DAYS - used)
      if (holidayDays > remaining + 0.001) {
        return {
          ok: false, status: 400,
          error: `Apprentice holiday days exceed the remaining balance (${remaining} day${remaining === 1 ? '' : 's'} left).`,
        }
      }
    }

    apprenticeTotal += collegeDays * collegeDayRate + holidayDays * holidayDayRate
  }

  // ── Reconcile totals ────────────────────────────────────────────────────
  const computedPoolTotal = round2(gridTotal + variationTotal + apprenticeTotal)

  for (const a of allocations) {
    const amt = a.grossAmount
    if (typeof amt !== 'number' || !isFinite(amt) || amt < 0) {
      return { ok: false, status: 400, error: 'Invalid worker allocation amount.' }
    }
  }

  const allocationsTotal = round2(allocations.reduce((sum, a) => sum + a.grossAmount, 0))

  if (Math.abs(allocationsTotal - computedPoolTotal) > 0.01) {
    return {
      ok: false, status: 400,
      error: `Worker allocations (£${allocationsTotal.toFixed(2)}) do not match the claim total (£${computedPoolTotal.toFixed(2)}). Refresh and try again.`,
    }
  }

  return { ok: true, sanitizedPoolItems, computedPoolTotal, collegeDayRate, holidayDayRate }
}

import { createServiceClient } from '@/lib/supabase/server'

type GridPoolItem = { type: string; id: string; amount: number; fullValue?: number }

/**
 * Reverse the claimed-percentage a claim added to its grid cells.
 * Used on withdrawal; rejection does the same reversal in the reject route
 * (rejected claims are kept, so resubmission must NOT reverse again).
 */
export async function reverseClaimGridPct(
  claimId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient()

  const { data: claim, error: claimErr } = await supabase
    .from('claim_periods')
    .select('pool_items')
    .eq('id', claimId)
    .single()
  if (claimErr) return { ok: false, error: claimErr.message }

  const gridItems = ((claim?.pool_items ?? []) as GridPoolItem[])
    .filter((p) => p.type === 'grid_cell')

  for (const item of gridItems) {
    if (!item.id || !item.fullValue) continue

    const { data: cell } = await supabase
      .from('price_grid')
      .select('total_claimed_pct')
      .eq('id', item.id)
      .single()

    const currentPct = cell?.total_claimed_pct ?? 0
    const addedPct   = Math.round((item.amount / item.fullValue) * 100)
    const newPct     = Math.max(0, currentPct - addedPct)
    const newColor   = newPct <= 0 ? 'white' : 'orange'

    const { error: gridErr } = await supabase
      .from('price_grid')
      .update({ total_claimed_pct: newPct, cell_color: newColor })
      .eq('id', item.id)
    if (gridErr) return { ok: false, error: gridErr.message }
  }

  return { ok: true }
}

/**
 * Remove a claim period and all rows that reference it.
 *
 * Pass `reverseGridPct: true` when the claim's grid percentages have NOT
 * already been reversed (e.g. withdrawing a pending claim). Rejected claims
 * were reversed at rejection time, so deleting them must skip reversal.
 */
export async function deleteClaimPeriod(
  claimId: string,
  opts: { reverseGridPct?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient()

  if (opts.reverseGridPct) {
    const reversed = await reverseClaimGridPct(claimId)
    if (!reversed.ok) return reversed
  }

  const { error: ledgerErr } = await supabase
    .from('apprentice_holiday_ledger')
    .delete()
    .eq('claim_period_id', claimId)
  if (ledgerErr) return { ok: false, error: ledgerErr.message }

  const { error: allocErr } = await supabase
    .from('claim_allocations')
    .delete()
    .eq('claim_period_id', claimId)
  if (allocErr) return { ok: false, error: allocErr.message }

  await supabase
    .from('variation_claims')
    .update({ claimed_in_period_id: null })
    .eq('claimed_in_period_id', claimId)

  const { error: claimErr } = await supabase
    .from('claim_periods')
    .delete()
    .eq('id', claimId)
  if (claimErr) return { ok: false, error: claimErr.message }

  return { ok: true }
}

import { createServiceClient } from '@/lib/supabase/server'
import { releasePriceGridClaim } from '@/lib/claims/price-grid-claim'

type GridPoolItem = { type: string; id: string; amount: number; fullValue?: number }

/**
 * Reverse the claimed money a claim added to its grid cells (atomic RPC).
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
    if (!item.id || !(item.amount > 0)) continue
    const released = await releasePriceGridClaim(supabase, item.id, item.amount)
    if (!released.ok) return released
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

  // Only pending claims may be withdrawn with grid reversal (B3).
  if (opts.reverseGridPct) {
    const { data: pending } = await supabase
      .from('claim_periods')
      .select('id')
      .eq('id', claimId)
      .eq('status', 'pending')
      .maybeSingle()
    if (!pending) {
      return { ok: false, error: 'Claim not found or already processed.' }
    }

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

  let claimDelete = supabase.from('claim_periods').delete().eq('id', claimId)
  if (opts.reverseGridPct) {
    claimDelete = claimDelete.eq('status', 'pending')
  }
  const { data: deleted, error: claimErr } = await claimDelete.select('id')
  if (claimErr) return { ok: false, error: claimErr.message }
  if (opts.reverseGridPct && (!deleted || deleted.length === 0)) {
    return { ok: false, error: 'Claim was processed by another action. Refresh and try again.' }
  }

  return { ok: true }
}

import { createServiceClient } from '@/lib/supabase/server'

/** Remove a claim period and all rows that reference it. */
export async function deleteClaimPeriod(claimId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient()

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

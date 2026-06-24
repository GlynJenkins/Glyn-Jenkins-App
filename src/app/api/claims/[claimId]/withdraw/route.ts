import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimId } = await params
    const supabase = createServiceClient()

    // Only allow withdrawing pending claims
    const { data: claim } = await supabase
      .from('claim_periods')
      .select('id, site_id, pool_items, foreman_id, status')
      .eq('id', claimId)
      .eq('status', 'pending')
      .single()

    if (!claim) {
      return NextResponse.json(
        { error: 'Claim not found or already approved/rejected.' },
        { status: 404 }
      )
    }

    if (claim.foreman_id !== auth.worker.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    // ── Reset price_grid cells back: decrement total_claimed_pct ──────
    const gridItems = ((claim.pool_items ?? []) as {
      type: string; id: string; amount: number; fullValue?: number
    }[]).filter((p) => p.type === 'grid_cell')

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

      await supabase
        .from('price_grid')
        .update({ total_claimed_pct: newPct, cell_color: newColor })
        .eq('id', item.id)
    }

    // ── Unlink variations ─────────────────────────────────────────────
    await supabase
      .from('variation_claims')
      .update({ claimed_in_period_id: null })
      .eq('claimed_in_period_id', claimId)

    // ── Delete allocations ────────────────────────────────────────────
    await supabase
      .from('claim_allocations')
      .delete()
      .eq('claim_period_id', claimId)

    // ── Delete the claim period ───────────────────────────────────────
    await supabase
      .from('claim_periods')
      .delete()
      .eq('id', claimId)

    // ── Build the cells URL param to pre-populate the grid ────────────
    // encode as cellId:penceAmount so the claim builder restores selections
    const cellsParam = gridItems
      .map((item) => `${item.id}:${Math.round(item.amount * 100)}`)
      .join(',')

    return NextResponse.json({
      success:    true,
      cellsParam, // foreman dashboard uses this to redirect back to /foreman/claim
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

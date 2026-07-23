import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { deleteClaimPeriod } from '@/lib/claims/delete-claim-period'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimId } = await params
    const supabase = createServiceClient()

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

    const gridItems = ((claim.pool_items ?? []) as {
      type: string; id: string; amount: number; fullValue?: number
    }[]).filter((p) => p.type === 'grid_cell')

    // Reversal happens inside deleteClaimPeriod so all cleanup paths behave the same.
    const deleted = await deleteClaimPeriod(claimId, { reverseGridPct: true })
    if (!deleted.ok) {
      return NextResponse.json(
        { error: `Could not withdraw claim: ${deleted.error}` },
        { status: 500 }
      )
    }

    const cellsParam = gridItems
      .map((item) => `${item.id}:${Math.round(item.amount * 100)}`)
      .join(',')

    return NextResponse.json({
      success:    true,
      cellsParam,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

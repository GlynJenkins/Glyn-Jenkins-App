import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { allocateVoNumbersForClaims } from '@/lib/variations/vo-reference'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { id }     = await params
    const { status, admin_rejection_reason } = await request.json() as {
      status: string
      admin_rejection_reason?: string
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // A variation already claimed in a pay period has been (or is being) paid —
    // changing its status would make it vanish from the register.
    const { data: existing } = await supabase
      .from('variation_claims')
      .select('id, claimed_in_period_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Variation not found.' }, { status: 404 })
    }
    if (existing.claimed_in_period_id) {
      return NextResponse.json(
        { error: 'This variation has already been claimed in a pay period and cannot be changed.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('variation_claims')
      .update({
        status,
        admin_rejection_reason: admin_rejection_reason ?? null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('[variations] status update failed:', error)
      return NextResponse.json({ error: 'Failed to update variation.' }, { status: 500 })
    }

    if (status === 'approved') {
      await allocateVoNumbersForClaims(supabase, [id])
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[variations] status update error:', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

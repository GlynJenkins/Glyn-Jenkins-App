import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { allocateVoNumbersForClaims } from '@/lib/variations/vo-reference'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { ids, status, admin_rejection_reason } = await request.json() as {
      ids:                    string[]
      status:                 string
      admin_rejection_reason?: string
    }

    if (!ids?.length || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Refuse to change any variation that has already been claimed in a pay
    // period — a paid variation must never vanish from the register.
    const { data: claimedRows } = await supabase
      .from('variation_claims')
      .select('id')
      .in('id', ids)
      .not('claimed_in_period_id', 'is', null)
    if (claimedRows && claimedRows.length > 0) {
      return NextResponse.json(
        { error: `${claimedRows.length} of the selected variations have already been claimed in a pay period and cannot be changed.` },
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
      .in('id', ids)

    if (error) {
      console.error('[variations] batch update failed:', error)
      return NextResponse.json({ error: 'Failed to update variations.' }, { status: 500 })
    }

    if (status === 'approved') {
      await allocateVoNumbersForClaims(supabase, ids)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[variations] batch update error:', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

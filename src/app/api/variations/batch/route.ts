import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

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

    const { error } = await supabase
      .from('variation_claims')
      .update({
        status,
        admin_rejection_reason: admin_rejection_reason ?? null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        updated_at:  new Date().toISOString(),
      })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

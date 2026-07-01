import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimIds, paid } = await request.json() as {
      claimIds: string[]
      paid:     boolean
    }

    if (!claimIds?.length || typeof paid !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('variation_claims')
      .update({
        developer_paid_at: paid ? new Date().toISOString() : null,
        updated_at:        new Date().toISOString(),
      })
      .in('id', claimIds)
      .eq('status', 'approved')

    if (error) {
      if (error.message.includes('developer_paid_at')) {
        return NextResponse.json(
          { error: 'Database migration required: run add_variation_developer_paid.sql in Supabase.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

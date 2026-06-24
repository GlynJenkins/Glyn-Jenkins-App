import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase   = createServiceClient()

    // Delete cells first (foreign key to site_stages)
    const { error: cellsErr } = await supabase
      .from('price_grid')
      .delete()
      .eq('site_id', siteId)

    if (cellsErr) return NextResponse.json({ error: cellsErr.message }, { status: 500 })

    // Then delete stages
    const { error: stagesErr } = await supabase
      .from('site_stages')
      .delete()
      .eq('site_id', siteId)

    if (stagesErr) return NextResponse.json({ error: stagesErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

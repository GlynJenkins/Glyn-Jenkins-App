import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
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

    if (cellsErr) return apiError("api/sites/[siteId]/clear", cellsErr)

    // Then delete stages
    const { error: stagesErr } = await supabase
      .from('site_stages')
      .delete()
      .eq('site_id', siteId)

    if (stagesErr) return apiError("api/sites/[siteId]/clear", stagesErr)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/sites/[siteId]/clear", err)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId }   = await params
    const { foremanId } = await request.json()
    if (!foremanId) return NextResponse.json({ error: 'foremanId required.' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('foreman_site_assignments')
      .insert({ id: crypto.randomUUID(), foreman_id: foremanId, site_id: siteId })

    if (error) return apiError("api/admin/sites/[siteId]/foremen", error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/admin/sites/[siteId]/foremen", err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId }   = await params
    const { foremanId } = await request.json()
    if (!foremanId) return NextResponse.json({ error: 'foremanId required.' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('foreman_site_assignments')
      .delete()
      .eq('foreman_id', foremanId)
      .eq('site_id', siteId)

    if (error) return apiError("api/admin/sites/[siteId]/foremen", error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/admin/sites/[siteId]/foremen", err)
  }
}

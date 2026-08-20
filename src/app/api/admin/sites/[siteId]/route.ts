import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { deleteSitePermanently } from '@/lib/sites/delete-site'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const body = await request.json() as { isActive?: boolean }

    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive (true/false) is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: site, error: fetchError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .maybeSingle()

    if (fetchError || !site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('sites')
      .update({ is_active: body.isActive })
      .eq('id', siteId)

    if (updateError) {
      return apiError('api/admin/sites/[siteId]', updateError)
    }

    return NextResponse.json({ success: true, isActive: body.isActive })
  } catch (err) {
    return apiError('api/admin/sites/[siteId]', err)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase = createServiceClient()
    const result = await deleteSitePermanently(supabase, siteId)

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/admin/sites/[siteId]', err)
  }
}

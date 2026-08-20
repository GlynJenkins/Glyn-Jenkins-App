import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadSiteClaimHistory } from '@/lib/claims/load-site-claim-history'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase = createServiceClient()

    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .maybeSingle()

    if (siteError) {
      return apiError('api/admin/sites/[siteId]/claim-history', siteError)
    }
    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const history = await loadSiteClaimHistory(supabase, siteId)

    return NextResponse.json(
      { history },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (err) {
    return apiError('api/admin/sites/[siteId]/claim-history', err)
  }
}

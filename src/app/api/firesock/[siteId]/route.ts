import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess, verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchFiresockSiteGrid } from '@/lib/firesock/queries'

export const dynamic = 'force-dynamic'

async function foremanHasSite(foremanId: string, siteId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foremanId)
    .eq('site_id', siteId)
    .maybeSingle()
  return !!data
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params

    const foremanAuth = await verifyForemanApiAccess()
    if (foremanAuth.ok) {
      const allowed = await foremanHasSite(foremanAuth.worker.id, siteId)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
      }
      const grid = await fetchFiresockSiteGrid(siteId)
      return NextResponse.json(grid)
    }

    const adminAuth = await verifyAdminApiAccess()
    if (adminAuth.ok) {
      const grid = await fetchFiresockSiteGrid(siteId)
      return NextResponse.json(grid)
    }

    return foremanAuth.response
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.'
    if (/relation|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'Database setup required. Run add_firesock_evidence.sql in Supabase.' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

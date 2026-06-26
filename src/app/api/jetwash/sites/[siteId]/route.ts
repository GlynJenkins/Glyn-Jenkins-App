import { NextResponse } from 'next/server'
import { verifyJetwashViewAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchJetwashPlots } from '@/lib/jetwash/queries'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyJetwashViewAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase = createServiceClient()

    const { data: site } = await supabase
      .from('sites')
      .select('id, name, address')
      .eq('id', siteId)
      .maybeSingle()

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const plots = await fetchJetwashPlots(siteId)
    const washed = plots.filter((p) => p.washed_at).length

    return NextResponse.json({
      site,
      plots,
      progress: {
        total:  plots.length,
        washed,
        pct:    plots.length ? Math.round((washed / plots.length) * 100) : 0,
      },
      readOnly: auth.isAdmin,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load plots.' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { verifyJetwashMarkAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { markPlotWashedById } from '@/lib/jetwash/queries'

export const dynamic = 'force-dynamic'

/** Legacy URL — resolves house plot by plot number, prefer POST /api/jetwash/records/[recordId]. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ siteId: string; plotNumber: string }> }
) {
  const auth = await verifyJetwashMarkAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId, plotNumber: encoded } = await params
    const plotNumber = decodeURIComponent(encoded)
    const supabase = createServiceClient()

    const { data } = await supabase
      .from('jetwash_plot_status')
      .select('id')
      .eq('site_id', siteId)
      .eq('plot_number', plotNumber)
      .eq('item_type', 'house')
      .eq('item_label', '')
      .maybeSingle()

    if (!data) {
      return NextResponse.json({ error: 'Plot not found on this site.' }, { status: 404 })
    }

    const result = await markPlotWashedById(data.id, auth.worker?.id ?? null)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, washed_at: result.washed_at })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not mark plot washed.' },
      { status: 500 }
    )
  }
}

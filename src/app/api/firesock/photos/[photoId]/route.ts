import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchFiresockSiteGrid } from '@/lib/firesock/queries'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { photoId } = await params
    const supabase = createServiceClient()

    const { data: photo, error: fetchErr } = await supabase
      .from('firesock_plot_photos')
      .select('id, site_id, plot_number, photo_path')
      .eq('id', photoId)
      .maybeSingle()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!photo) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })

    const { data: assignment } = await supabase
      .from('foreman_site_assignments')
      .select('site_id')
      .eq('foreman_id', auth.worker.id)
      .eq('site_id', photo.site_id)
      .maybeSingle()

    if (!assignment) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    await supabase.storage.from('worker-documents').remove([photo.photo_path])

    const { error: deleteErr } = await supabase
      .from('firesock_plot_photos')
      .delete()
      .eq('id', photoId)

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    const grid = await fetchFiresockSiteGrid(photo.site_id)
    const plot = grid.plots.find((p) => p.plot_number === photo.plot_number)

    return NextResponse.json({ success: true, plot, grid })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

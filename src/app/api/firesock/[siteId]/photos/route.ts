import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import { fetchFiresockSiteGrid } from '@/lib/firesock/queries'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function photoExtension(mime: string): string {
  return mime.includes('png') ? 'png' : 'jpg'
}

/** Safe storage path segment — plot numbers may contain slashes or spaces. */
function storagePlotSegment(plotNumber: string): string {
  return plotNumber.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase = createServiceClient()

    const { data: assignment } = await supabase
      .from('foreman_site_assignments')
      .select('site_id')
      .eq('foreman_id', auth.worker.id)
      .eq('site_id', siteId)
      .maybeSingle()

    if (!assignment) {
      return NextResponse.json({ error: 'Forbidden — site not assigned to you.' }, { status: 403 })
    }

    const formData   = await request.formData()
    const plotNumber = (formData.get('plotNumber') as string | null)?.trim()
    if (!plotNumber) {
      return NextResponse.json({ error: 'Plot number is required.' }, { status: 400 })
    }

    const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) {
      return NextResponse.json({ error: 'Select at least one photo.' }, { status: 400 })
    }

    const grid = await fetchFiresockSiteGrid(siteId)
    const plot = grid.plots.find((p) => p.plot_number === plotNumber)
    if (!plot) {
      return NextResponse.json({ error: 'Plot not found on this site.' }, { status: 404 })
    }
    if (!plot.requires_evidence) {
      return NextResponse.json({ error: 'This plot does not require firesock evidence.' }, { status: 400 })
    }

    const { count: existingCount } = await supabase
      .from('firesock_plot_photos')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('plot_number', plotNumber)

    let sortOrder = existingCount ?? 0
    const ts = Date.now()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const raw  = Buffer.from(await file.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      const ext = photoExtension(normalized.mime)
      const plotSeg   = storagePlotSegment(plotNumber)
      const photoPath = `firesock/${siteId}/${plotSeg}/${ts}-${i}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('worker-documents')
        .upload(photoPath, normalized.buffer, { contentType: normalized.mime, upsert: false })

      if (uploadErr) {
        return NextResponse.json({ error: `Photo upload failed: ${uploadErr.message}` }, { status: 500 })
      }

      const { error: insertErr } = await supabase.from('firesock_plot_photos').insert({
        site_id:      siteId,
        plot_number:  plotNumber,
        photo_path:   photoPath,
        sort_order:   sortOrder++,
        uploaded_by:  auth.worker.id,
      })

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    }

    const refreshed = await fetchFiresockSiteGrid(siteId)
    const updated   = refreshed.plots.find((p) => p.plot_number === plotNumber)

    return NextResponse.json({
      success: true,
      plot:    updated,
      grid:    refreshed,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { getQaInspectionForDownload } from '@/lib/qa/queries'
import { qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { inspectionId } = await params
    const inspection = await getQaInspectionForDownload(inspectionId)

    if (!inspection?.pdf_path) {
      return NextResponse.json({ error: 'Inspection PDF not found.' }, { status: 404 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.storage
      .from('worker-documents')
      .download(inspection.pdf_path)

    if (error || !data) {
      return NextResponse.json({ error: 'Could not download PDF.' }, { status: 500 })
    }

    const site = Array.isArray(inspection.sites) ? inspection.sites[0] : inspection.sites
    const siteName = (site as { name?: string } | null)?.name ?? 'site'
    const filename = `QA-${siteName.replace(/\s+/g, '-')}-plot-${inspection.plot_number}-${qaStageLabel(inspection.stage)}.pdf`

    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { firesockPlotPdfFilename, loadFiresockPlotPdf } from '@/lib/firesock/load-plot-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string; plotNumber: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId, plotNumber } = await params
    const decodedPlot = decodeURIComponent(plotNumber)
    const pdf = await loadFiresockPlotPdf(siteId, decodedPlot)
    if (!pdf) {
      return NextResponse.json(
        { error: 'Plot not found or has no photos to export.' },
        { status: 404 },
      )
    }

    const filename = firesockPlotPdfFilename(decodedPlot)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not generate PDF.' },
      { status: 500 },
    )
  }
}

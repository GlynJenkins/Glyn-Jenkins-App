import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { generateQaInspectionPdf } from '@/lib/qa/generate-inspection-pdf'
import { loadQaInspectionPdfData } from '@/lib/qa/load-qa-inspection-pdf'
import { qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { inspectionId } = await params
    const data = await loadQaInspectionPdfData(inspectionId)

    if (!data) {
      return NextResponse.json({ error: 'Inspection PDF not found.' }, { status: 404 })
    }

    const pdf = await generateQaInspectionPdf(data)
    const filename = `QA-${data.siteName.replace(/\s+/g, '-')}-plot-${data.plotNumber}-${qaStageLabel(data.stage)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not generate PDF.' },
      { status: 500 },
    )
  }
}

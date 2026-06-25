import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { loadDeveloperVariationPdfData } from '@/lib/variations/load-developer-variation-pdf'
import { generateDeveloperVariationPdf } from '@/lib/variations/generate-developer-variation-pdf'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { submissionId } = await params
    const data = await loadDeveloperVariationPdfData(submissionId)

    if (!data) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
    }

    const pdf = await generateDeveloperVariationPdf(data)
    const filename = `Glyn-Jenkins-Variation-${data.reference}.pdf`

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
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { loadFiresockSitePdf } from '@/lib/firesock/load-site-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const pdf = await loadFiresockSitePdf(siteId)
    if (!pdf) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const filename = `firesock-evidence-${siteId.slice(0, 8)}.pdf`
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

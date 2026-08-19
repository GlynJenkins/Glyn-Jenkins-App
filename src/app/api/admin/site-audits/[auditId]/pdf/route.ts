import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { buildAndStoreSiteAuditPdf } from '@/lib/site-audits/load-site-audit-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ auditId: string }> }

/** Signed URL for completed audit PDF. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const supabase = createServiceClient()

    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status, pdf_path')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    if (audit.status !== 'completed') {
      return NextResponse.json({ error: 'PDF is available after the audit is completed.' }, { status: 400 })
    }

    let pdfPath = audit.pdf_path as string | null
    let filename = pdfPath?.split('/').pop() || 'site-audit.pdf'

    if (!pdfPath) {
      const built = await buildAndStoreSiteAuditPdf(auditId)
      if ('error' in built) {
        return NextResponse.json({ error: built.error }, { status: built.status })
      }
      pdfPath = built.pdfPath
      filename = built.filename
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(pdfPath, 3600)

    if (error || !data?.signedUrl) {
      // Stored object missing — rebuild once then resign.
      const built = await buildAndStoreSiteAuditPdf(auditId)
      if ('error' in built) {
        return NextResponse.json(
          { error: error?.message || 'Could not generate download link.' },
          { status: 500 },
        )
      }
      const retry = await supabase.storage
        .from('worker-documents')
        .createSignedUrl(built.pdfPath, 3600)
      if (retry.error || !retry.data?.signedUrl) {
        return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
      }
      return NextResponse.json({ url: retry.data.signedUrl, filename: built.filename })
    }

    return NextResponse.json({ url: data.signedUrl, filename })
  } catch (err) {
    return apiError('api/admin/site-audits pdf', err)
  }
}

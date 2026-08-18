import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadSiteAuditPdfBuffer } from '@/lib/site-audits/load-site-audit-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

    const pdf = await loadSiteAuditPdfBuffer(auditId)
    if ('error' in pdf) {
      return NextResponse.json({ error: pdf.error }, { status: pdf.status })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(pdf.pdfPath, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl, filename: pdf.filename })
  } catch (err) {
    return apiError('api/admin/site-audits pdf', err)
  }
}

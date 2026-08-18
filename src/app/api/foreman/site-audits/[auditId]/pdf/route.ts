import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import { loadSiteAuditPdfBuffer } from '@/lib/site-audits/load-site-audit-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ auditId: string }> }

/** Signed PDF URL for assigned-site completed audits. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const supabase = createServiceClient()

    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, site_id, status, pdf_path')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit || audit.status !== 'completed') {
      return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    }

    const allowed = await foremanHasSiteAccess(auth.worker.id, audit.site_id)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
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
    return apiError('api/foreman/site-audits pdf', err)
  }
}

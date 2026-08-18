import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadSiteAuditPdfBuffer } from '@/lib/site-audits/load-site-audit-pdf'
import { issueSiteAuditToRecipients } from '@/lib/site-audits/send-site-audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ auditId: string }> }

/** Re-issue completed audit PDF to additional / failed recipients. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const body = await request.json() as { recipientWorkerIds?: string[] }
    const recipientIds = Array.isArray(body.recipientWorkerIds)
      ? [...new Set(body.recipientWorkerIds.map((id) => String(id).trim()).filter(Boolean))]
      : []

    if (!recipientIds.length) {
      return NextResponse.json({ error: 'Select at least one recipient.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    if (audit.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed audits can be re-sent.' }, { status: 400 })
    }

    const pdf = await loadSiteAuditPdfBuffer(auditId)
    if ('error' in pdf) {
      return NextResponse.json({ error: pdf.error }, { status: pdf.status })
    }

    const { data: workers } = await supabase
      .from('workers')
      .select('id, first_name, surname, email, phone')
      .in('id', recipientIds)

    const targets = (workers ?? []).map((w) => ({
      workerId: w.id,
      name:     `${w.first_name} ${w.surname}`.trim(),
      email:    w.email,
      phone:    w.phone,
    }))

    const deliveries = await issueSiteAuditToRecipients({
      auditId,
      siteName:    pdf.siteName,
      pdfBuffer:   pdf.buffer,
      pdfFilename: pdf.filename,
      pdfPath:     pdf.pdfPath,
      targets,
    })

    return NextResponse.json({ success: true, deliveries })
  } catch (err) {
    return apiError('api/admin/site-audits resend', err)
  }
}

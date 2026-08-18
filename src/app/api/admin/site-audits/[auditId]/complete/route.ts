import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { buildAndStoreSiteAuditPdf } from '@/lib/site-audits/load-site-audit-pdf'
import { issueSiteAuditToRecipients } from '@/lib/site-audits/send-site-audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ auditId: string }> }

/** Complete draft: generate PDF, mark completed, issue to selected workers. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const body = await request.json() as {
      generalNotes?: string
      recipientWorkerIds?: string[]
    }

    const supabase = createServiceClient()
    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, site_id, status')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    if (audit.status !== 'draft') {
      return NextResponse.json({ error: 'This audit is already completed.' }, { status: 400 })
    }

    const { count } = await supabase
      .from('site_audit_items')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', auditId)

    if (!count || count < 1) {
      return NextResponse.json(
        {
          error:
            'Add at least one item — or if the site was clean, add a single item saying so.',
        },
        { status: 400 },
      )
    }

    const generalNotes = typeof body.generalNotes === 'string'
      ? body.generalNotes.trim().slice(0, 5000)
      : ''

    await supabase
      .from('site_audits')
      .update({
        general_notes: generalNotes || null,
        audit_date:    new Date().toISOString(),
      })
      .eq('id', auditId)

    const pdf = await buildAndStoreSiteAuditPdf(auditId)
    if ('error' in pdf) {
      return NextResponse.json({ error: pdf.error }, { status: pdf.status })
    }

    await supabase
      .from('site_audits')
      .update({ status: 'completed' })
      .eq('id', auditId)

    const recipientIds = Array.isArray(body.recipientWorkerIds)
      ? [...new Set(body.recipientWorkerIds.map((id) => String(id).trim()).filter(Boolean))]
      : []

    let deliveries: Awaited<ReturnType<typeof issueSiteAuditToRecipients>> = []
    if (recipientIds.length) {
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

      deliveries = await issueSiteAuditToRecipients({
        auditId,
        siteName:    pdf.siteName,
        pdfBuffer:   pdf.buffer,
        pdfFilename: pdf.filename,
        pdfPath:     pdf.pdfPath,
        targets,
      })
    }

    return NextResponse.json({
      success: true,
      auditId,
      pdfReady: true,
      deliveries,
    })
  } catch (err) {
    return apiError('api/admin/site-audits complete', err)
  }
}

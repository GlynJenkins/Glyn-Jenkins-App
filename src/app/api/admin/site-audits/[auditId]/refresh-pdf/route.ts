import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { buildAndStoreSiteAuditPdf } from '@/lib/site-audits/load-site-audit-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ auditId: string }> }

/**
 * After editing a completed audit: save notes (optional) and regenerate the PDF.
 * Status stays completed so foremen keep seeing the report.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const body = await request.json().catch(() => ({})) as { generalNotes?: string }

    const supabase = createServiceClient()
    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    if (audit.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed audits use Save & update PDF. Complete a draft first.' },
        { status: 400 },
      )
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
      : undefined

    if (generalNotes !== undefined) {
      await supabase
        .from('site_audits')
        .update({ general_notes: generalNotes || null })
        .eq('id', auditId)
    }

    const pdf = await buildAndStoreSiteAuditPdf(auditId)
    if ('error' in pdf) {
      return NextResponse.json({ error: pdf.error }, { status: pdf.status })
    }

    return NextResponse.json({
      success:  true,
      auditId,
      pdfReady: true,
      filename: pdf.filename,
    })
  } catch (err) {
    return apiError('api/admin/site-audits refresh-pdf', err)
  }
}

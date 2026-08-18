import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET ?siteId= — completed audits for an assigned site. */
export async function GET(request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const siteId = request.nextUrl.searchParams.get('siteId')?.trim()
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
    }

    const allowed = await foremanHasSiteAccess(auth.worker.id, siteId)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const { data: audits, error } = await supabase
      .from('site_audits')
      .select(`
        id, site_id, audited_by_name, audited_by_role, audit_date,
        general_notes, status, pdf_path,
        site_audit_items ( id )
      `)
      .eq('site_id', siteId)
      .eq('status', 'completed')
      .order('audit_date', { ascending: false })

    if (error) return apiError('api/foreman/site-audits GET', error)

    const auditIds = (audits ?? []).map((a) => a.id)
    const { data: views } = auditIds.length
      ? await supabase
          .from('site_audit_views')
          .select('audit_id')
          .eq('worker_id', auth.worker.id)
          .in('audit_id', auditIds)
      : { data: [] as { audit_id: string }[] }

    const seen = new Set((views ?? []).map((v) => v.audit_id))

    return NextResponse.json({
      audits: (audits ?? []).map((a) => ({
        id:            a.id,
        siteId:        a.site_id,
        auditedByName: a.audited_by_name,
        auditedByRole: a.audited_by_role,
        auditDate:     a.audit_date,
        generalNotes:  a.general_notes,
        pdfReady:      !!a.pdf_path,
        itemCount:     Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
        unseen:        !seen.has(a.id),
      })),
    })
  } catch (err) {
    return apiError('api/foreman/site-audits GET', err)
  }
}

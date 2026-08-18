import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { roleLabel } from '@/lib/site-audits/load-site-audit-pdf'

export const dynamic = 'force-dynamic'

/** GET ?siteId= — list audits for a site. */
export async function GET(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const siteId = request.nextUrl.searchParams.get('siteId')?.trim()
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: audits, error } = await supabase
      .from('site_audits')
      .select(`
        id, site_id, audited_by_name, audited_by_role, audit_date,
        general_notes, status, pdf_path, created_at,
        site_audit_items ( id )
      `)
      .eq('site_id', siteId)
      .order('audit_date', { ascending: false })

    if (error) return apiError('api/admin/site-audits GET', error, 'Could not load site audits.')

    const items = (audits ?? []).map((a) => ({
      id:             a.id,
      siteId:         a.site_id,
      auditedByName:  a.audited_by_name,
      auditedByRole:  a.audited_by_role,
      auditDate:      a.audit_date,
      generalNotes:   a.general_notes,
      status:         a.status,
      pdfReady:       !!a.pdf_path,
      itemCount:      Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
      createdAt:      a.created_at,
    }))

    return NextResponse.json({ audits: items })
  } catch (err) {
    return apiError('api/admin/site-audits GET', err)
  }
}

/** POST — create draft audit for a site. */
export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as { siteId?: string }
    const siteId = body.siteId?.trim()
    if (!siteId) {
      return NextResponse.json({ error: 'Site is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: site } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .maybeSingle()

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const name = auth.worker
      ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
      : (auth.user.email?.split('@')[0] || 'Admin')
    const role = roleLabel(auth.worker?.role) || 'Management'

    const { data: audit, error } = await supabase
      .from('site_audits')
      .insert({
        site_id:          siteId,
        audited_by_name:  name,
        audited_by_role:  role,
        status:           'draft',
      })
      .select('id')
      .single()

    if (error || !audit) {
      return apiError('api/admin/site-audits POST', error, 'Could not start site audit.')
    }

    return NextResponse.json({ auditId: audit.id, siteId, siteName: site.name })
  } catch (err) {
    return apiError('api/admin/site-audits POST', err)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

/** Mark audit as seen by this foreman (dismiss modal / after viewing). */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const supabase = createServiceClient()

    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, site_id, status')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit || audit.status !== 'completed') {
      return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    }

    const allowed = await foremanHasSiteAccess(auth.worker.id, audit.site_id)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const { error } = await supabase.from('site_audit_views').upsert(
      {
        audit_id:  auditId,
        worker_id: auth.worker.id,
        seen_at:   new Date().toISOString(),
      },
      { onConflict: 'audit_id,worker_id' },
    )

    if (error) return apiError('api/foreman/site-audits seen', error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/foreman/site-audits seen', err)
  }
}

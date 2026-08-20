import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

/** Mark this audit as done (or not) for the logged-in foreman. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const body = await request.json().catch(() => ({})) as { done?: boolean }
    const done = body.done !== false

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

    const now = new Date().toISOString()
    const { error } = await supabase.from('site_audit_views').upsert(
      {
        audit_id:      auditId,
        worker_id:     auth.worker.id,
        seen_at:       now,
        completed_at:  done ? now : null,
      },
      { onConflict: 'audit_id,worker_id' },
    )

    if (error) return apiError('api/foreman/site-audits done', error)
    return NextResponse.json({ success: true, done })
  } catch (err) {
    return apiError('api/foreman/site-audits done', err)
  }
}

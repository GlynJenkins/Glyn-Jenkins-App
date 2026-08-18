import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { getForemanSiteIds } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Unseen completed audits across assigned sites (for login modal). */
export async function GET(_request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const siteIds = await getForemanSiteIds(auth.worker.id)
    if (!siteIds.length) return NextResponse.json({ audits: [] })

    const supabase = createServiceClient()
    const { data: audits, error } = await supabase
      .from('site_audits')
      .select(`
        id, site_id, audit_date, audited_by_name,
        sites ( name ),
        site_audit_items ( id )
      `)
      .in('site_id', siteIds)
      .eq('status', 'completed')
      .order('audit_date', { ascending: false })
      .limit(50)

    if (error) return apiError('api/foreman/site-audits/unseen', error)

    const auditIds = (audits ?? []).map((a) => a.id)
    if (!auditIds.length) return NextResponse.json({ audits: [] })

    const { data: views } = await supabase
      .from('site_audit_views')
      .select('audit_id')
      .eq('worker_id', auth.worker.id)
      .in('audit_id', auditIds)

    const seen = new Set((views ?? []).map((v) => v.audit_id))

    const unseen = (audits ?? [])
      .filter((a) => !seen.has(a.id))
      .map((a) => {
        const site = Array.isArray(a.sites) ? a.sites[0] : a.sites
        return {
          id:        a.id,
          siteId:    a.site_id,
          siteName:  site?.name ?? 'Site',
          auditDate: a.audit_date,
          itemCount: Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
        }
      })

    return NextResponse.json({ audits: unseen })
  } catch (err) {
    return apiError('api/foreman/site-audits/unseen', err)
  }
}

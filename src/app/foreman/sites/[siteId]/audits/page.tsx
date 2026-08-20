import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import ForemanAuditsList from './_components/ForemanAuditsList'

export const dynamic = 'force-dynamic'

export default async function ForemanSiteAuditsPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  const { worker } = await requireForemanAccess()

  const allowed = await foremanHasSiteAccess(worker.id, siteId)
  if (!allowed) notFound()

  const supabase = createServiceClient()
  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()
  if (!site) notFound()

  const { data: audits } = await supabase
    .from('site_audits')
    .select(`
      id, audited_by_name, audited_by_role, audit_date, pdf_path,
      site_audit_items ( id )
    `)
    .eq('site_id', siteId)
    .eq('status', 'completed')
    .order('audit_date', { ascending: false })

  const auditIds = (audits ?? []).map((a) => a.id)
  const { data: views } = auditIds.length
    ? await supabase
        .from('site_audit_views')
        .select('audit_id, completed_at')
        .eq('worker_id', worker.id)
        .in('audit_id', auditIds)
    : { data: [] as { audit_id: string; completed_at: string | null }[] }
  const seen = new Set((views ?? []).map((v) => v.audit_id))
  const done = new Set(
    (views ?? []).filter((v) => !!v.completed_at).map((v) => v.audit_id),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link href="/foreman" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
            ← Sites
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Site Audits</h1>
          <p className="text-slate-400 text-sm mt-0.5">{site.name}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <ForemanAuditsList
          siteId={siteId}
          audits={(audits ?? []).map((a) => ({
            id: a.id,
            auditedByName: a.audited_by_name,
            auditedByRole: a.audited_by_role,
            auditDate: a.audit_date,
            itemCount: Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
            pdfReady: !!a.pdf_path,
            unseen: !seen.has(a.id),
            done: done.has(a.id),
          }))}
        />
      </main>
    </div>
  )
}

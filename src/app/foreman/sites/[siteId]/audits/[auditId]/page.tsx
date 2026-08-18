import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import ForemanAuditDetail from './_components/ForemanAuditDetail'

export const dynamic = 'force-dynamic'

export default async function ForemanAuditPage({
  params,
}: {
  params: Promise<{ siteId: string; auditId: string }>
}) {
  const { siteId, auditId } = await params
  const { worker } = await requireForemanAccess()

  const allowed = await foremanHasSiteAccess(worker.id, siteId)
  if (!allowed) notFound()

  const supabase = createServiceClient()
  const { data: audit } = await supabase
    .from('site_audits')
    .select('id, site_id, status')
    .eq('id', auditId)
    .eq('site_id', siteId)
    .eq('status', 'completed')
    .maybeSingle()

  if (!audit) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href={`/foreman/sites/${siteId}/audits`}
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase"
          >
            ← Site audits
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Site audit</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <ForemanAuditDetail siteId={siteId} auditId={auditId} />
      </main>
    </div>
  )
}

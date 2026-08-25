import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import ForemanQaSnagsClient from './_components/ForemanQaSnagsClient'

export const dynamic = 'force-dynamic'

export default async function ForemanQaSnagsPage({
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link href="/foreman" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
            ← Sites
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Quality snags</h1>
          <p className="text-slate-400 text-sm mt-0.5">{site.name}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <ForemanQaSnagsClient siteId={siteId} />
      </main>
    </div>
  )
}

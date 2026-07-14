import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { fetchFiresockSiteGrid } from '@/lib/firesock/queries'
import PortalHeader from '@/components/PortalHeader'
import FiresockPlotList from './_components/FiresockPlotList'

export const dynamic = 'force-dynamic'

export default async function ForemanFiresocksPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  const { worker } = await requireForemanAccess()
  const supabase = createServiceClient()

  const { data: assignment } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', worker.id)
    .eq('site_id', siteId)
    .maybeSingle()

  if (!assignment) notFound()

  let grid: Awaited<ReturnType<typeof fetchFiresockSiteGrid>> | null = null
  try {
    grid = await fetchFiresockSiteGrid(siteId)
  } catch {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="max-w-lg mx-auto">
          <Link
            href="/foreman"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase"
          >
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">{grid!.site_name}</h1>
          <p className="text-slate-400 text-xs mt-0.5">Roof firesocks evidence</p>
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <FiresockPlotList siteId={siteId} initialGrid={grid!} />
      </div>
    </div>
  )
}

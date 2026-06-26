import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireJetwasherAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchJetwashPlots } from '@/lib/jetwash/queries'
import JetwashPlotList from './_components/JetwashPlotList'

export const dynamic = 'force-dynamic'

export default async function JetwashSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  await requireJetwasherAccess()
  const { siteId } = await params

  const supabase = createServiceClient()
  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) notFound()

  let plots: Awaited<ReturnType<typeof fetchJetwashPlots>> = []
  try {
    plots = await fetchJetwashPlots(siteId)
  } catch {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">{site.name}</h1>
            <p className="text-slate-400 text-xs mt-1">Jetwash log</p>
          </div>
          <Link
            href="/jetwash"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Sites
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <JetwashPlotList
          siteId={siteId}
          siteName={site.name}
          initialPlots={plots}
        />
      </div>
    </div>
  )
}

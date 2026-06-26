import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchJetwashPlots } from '@/lib/jetwash/queries'
import JetwashPlotList from '@/app/jetwash/sites/[siteId]/_components/JetwashPlotList'

export const dynamic = 'force-dynamic'

export default async function AdminSiteJetwashPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  await requireAdminAccess()
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
    plots = []
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <Link
              href={`/admin/sites/${siteId}`}
              className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
            >
              ← {site.name}
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Jetwash progress</h1>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <JetwashPlotList
          siteId={siteId}
          siteName={site.name}
          initialPlots={plots}
          readOnly
        />
      </div>
    </div>
  )
}

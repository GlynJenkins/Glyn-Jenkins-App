import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { fetchFiresockSiteGrid } from '@/lib/firesock/queries'
import FiresockPlotList from '@/app/foreman/sites/[siteId]/firesocks/_components/FiresockPlotList'

export const dynamic = 'force-dynamic'

export default async function AdminFiresockSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  await requireAdminAccess()
  const { siteId } = await params

  let grid: Awaited<ReturnType<typeof fetchFiresockSiteGrid>> | null = null
  try {
    grid = await fetchFiresockSiteGrid(siteId)
  } catch {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/admin/firesocks"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
          >
            ← Roof firesocks
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">{grid!.site_name}</h1>
          <p className="text-slate-400 text-xs mt-0.5">Evidence by plot</p>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        <FiresockPlotList
          siteId={siteId}
          initialGrid={grid!}
          canUpload={false}
          showPlotPdfDownloads
        />
      </div>
    </div>
  )
}

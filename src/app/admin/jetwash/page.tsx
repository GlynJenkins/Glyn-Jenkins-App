import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { fetchJetwashSiteSummaries } from '@/lib/jetwash/queries'
import JetwashSiteList from '@/app/jetwash/_components/JetwashSiteList'

export const dynamic = 'force-dynamic'

export default async function AdminJetwashPage() {
  await requireAdminAccess()

  let sites: Awaited<ReturnType<typeof fetchJetwashSiteSummaries>> = []
  let setupRequired = false

  try {
    sites = await fetchJetwashSiteSummaries(false)
  } catch {
    setupRequired = true
  }

  const totalPlots = sites.reduce((n, s) => n + s.total_plots, 0)
  const washedPlots = sites.reduce((n, s) => n + s.washed_plots, 0)
  const overallPct = totalPlots ? Math.round((washedPlots / totalPlots) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Jetwashing</h1>
            {!setupRequired && totalPlots > 0 && (
              <p className="text-slate-400 text-xs mt-1">
                {washedPlots} of {totalPlots} plots washed · {overallPct}% overall
              </p>
            )}
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        {setupRequired ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
            <p className="font-semibold">Database setup required</p>
            <p className="mt-2 text-amber-800">
              Run <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">add_jetwash_tracking.sql</code>{' '}
              in Supabase, then refresh.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">
              Tap a site to see which plots have been jetwashed. Plot lists come from each site&apos;s uploaded grid.
            </p>
            <JetwashSiteList sites={sites} variant="admin" />
          </>
        )}
      </div>
    </div>
  )
}

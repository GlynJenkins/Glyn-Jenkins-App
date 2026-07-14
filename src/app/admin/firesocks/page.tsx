import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { fetchFiresockSiteSummaries } from '@/lib/firesock/queries'
import FiresockSiteList from './_components/FiresockSiteList'

export const dynamic = 'force-dynamic'

export default async function AdminFiresocksPage() {
  await requireAdminAccess()

  let sites: Awaited<ReturnType<typeof fetchFiresockSiteSummaries>> = []
  let setupRequired = false

  try {
    sites = await fetchFiresockSiteSummaries(false)
  } catch {
    setupRequired = true
  }

  const required = sites.reduce((n, s) => n + s.required_plots, 0)
  const complete = sites.reduce((n, s) => n + s.complete_plots, 0)
  const overallPct = required ? Math.round((complete / required) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Roof firesocks</h1>
            {!setupRequired && required > 0 && (
              <p className="text-slate-400 text-xs mt-1">
                {complete} of {required} plots complete · {overallPct}% overall
              </p>
            )}
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        {setupRequired ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
            <p className="font-semibold">Database setup required</p>
            <p className="mt-2 text-amber-800">
              Run <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">add_firesock_evidence.sql</code>{' '}
              in Supabase, then refresh.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">
              Tracks roof firesock photos per plot. Mirrors each site price grid on upload.
              Roof completion claims are blocked until each plot has at least 6 photos.
            </p>
            <FiresockSiteList sites={sites} />
          </>
        )}
      </div>
    </div>
  )
}

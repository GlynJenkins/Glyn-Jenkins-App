import { requireJetwasherAccess } from '@/lib/auth/portal-access'
import { fetchJetwashSiteSummaries } from '@/lib/jetwash/queries'
import LogoutButton from '@/app/admin/_components/LogoutButton'
import PortalHeader from '@/components/PortalHeader'
import JetwashSiteList from './_components/JetwashSiteList'

export const dynamic = 'force-dynamic'

export default async function JetwashPage() {
  const { worker } = await requireJetwasherAccess()

  let sites: Awaited<ReturnType<typeof fetchJetwashSiteSummaries>> = []
  let setupRequired = false

  try {
    sites = await fetchJetwashSiteSummaries()
  } catch {
    setupRequired = true
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">
              {worker.first_name} {worker.surname}
            </h1>
            <p className="text-slate-400 text-sm">Jetwashing</p>
          </div>
          <LogoutButton />
        </div>
      </PortalHeader>

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
              Select a site to log washed plots. Each plot can only be marked once.
            </p>
            <JetwashSiteList sites={sites} />
          </>
        )}
      </div>
    </div>
  )
}

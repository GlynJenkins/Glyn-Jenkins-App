import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { loadSiteSignOffSiteSummaries } from '@/lib/variations/load-site-signoff-queue'
import { PenLine, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DeveloperAgentSignOffIndexPage() {
  await requireAdminAccess()

  const sites = await loadSiteSignOffSiteSummaries()
  const totalPending = sites.reduce((n, s) => n + s.pendingCount, 0)
  const totalWaiting = sites.reduce((n, s) => n + s.waitingCount, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <Link
              href="/admin/variations/developer"
              className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
            >
              ← Developer variations
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Site agent sign-off</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              After work is complete — for management on site
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-900 space-y-2">
          <p className="font-semibold">When to use this</p>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed">
            <li>Developer agreed the cost</li>
            <li>Foreman variation approved (work authorised)</li>
            <li>Work is complete on site</li>
            <li>Site agent signs here → download PDF → submit for payment → mark paid</li>
          </ol>
        </div>

        {totalPending > 0 && (
          <div className="flex items-center gap-2 text-sm text-orange-800 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <PenLine className="w-4 h-4 shrink-0" />
            {totalPending} variation{totalPending === 1 ? '' : 's'} ready for sign-off across your sites
          </div>
        )}

        {totalWaiting > 0 && totalPending === 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <PenLine className="w-4 h-4 shrink-0" />
            {totalWaiting} variation{totalWaiting === 1 ? '' : 's'} in the pipeline — open a site to see what is still blocking sign-off
          </div>
        )}

        {sites.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-sm text-slate-600">Nothing awaiting sign-off right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sites.map((site) => (
              <Link
                key={site.siteId}
                href={`/admin/variations/sign-off/${site.siteId}`}
                className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-orange-200 transition-colors"
              >
                <div>
                  <p className="font-semibold text-slate-900">{site.siteName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {site.pendingCount > 0
                      ? `${site.pendingCount} ready to sign`
                      : site.waitingCount > 0
                        ? `${site.waitingCount} waiting — not ready yet`
                        : `${site.signedCount} signed`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

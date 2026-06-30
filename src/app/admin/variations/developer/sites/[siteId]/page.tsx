import { requireAdminAccess } from '@/lib/auth/portal-access'
import { loadSiteVariationVoRows } from '@/lib/variations/site-variation-accounts'
import { formatSiteCode } from '@/lib/variations/vo-reference'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteVariationVoList from '../../_components/SiteVariationVoList'

export const dynamic = 'force-dynamic'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

export default async function SiteVariationAccountPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  await requireAdminAccess()
  const { siteId } = await params

  const data = await loadSiteVariationVoRows(siteId)
  if (!data) notFound()

  const { site, rows, totals } = data

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href="/admin/variations/developer/sites"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
          >
            ← Site accounts
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-orange-300 bg-orange-900/50 px-2.5 py-1 rounded-lg">
              {formatSiteCode(site.siteCode)}
            </span>
            <h1 className="text-xl font-bold text-white">{site.name}</h1>
          </div>
          <p className="text-slate-400 text-xs mt-1">Variation account</p>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Pending</p>
            <p className="text-lg font-bold text-amber-600">{fmt(totals.pendingAmount)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Paid</p>
            <p className="text-lg font-bold text-green-600">{fmt(totals.paidAmount)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Profit</p>
            <p className={`text-lg font-bold ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmt(totals.profit)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Foreman cost</p>
            <p className="text-lg font-bold text-slate-700">{fmt(totals.foremanTotal)}</p>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Variations ({totals.voCount})
          </h2>
          <SiteVariationVoList rows={rows} />
        </div>
      </div>
    </div>
  )
}

import Link from 'next/link'
import type { CostToCompleteReport } from '@/lib/production/cost-to-complete'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

type Props = {
  report: CostToCompleteReport
}

export default function CostToCompletePanel({ report }: Props) {
  const grandPct =
    report.grandSiteTotal > 0
      ? Math.round((report.grandClaimed / report.grandSiteTotal) * 1000) / 10
      : 0

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Cost to Complete</h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Total value is the priced grid for each active site (variations not included).
          Claimed follows booking-in drawdown on the grid — separate from wages paid below.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border-b border-slate-100 bg-slate-50/60">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">All sites · total</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(report.grandSiteTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Claimed to date</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{fmt(report.grandClaimed)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-orange-700 font-medium">Remaining</p>
          <p className="text-xl font-bold text-orange-900 mt-0.5">{fmt(report.grandRemaining)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{grandPct}% complete overall</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Site</th>
              <th className="px-4 py-3 font-semibold text-right">Total value</th>
              <th className="px-4 py-3 font-semibold text-right">Claimed</th>
              <th className="px-4 py-3 font-semibold text-right">Remaining</th>
              <th className="px-4 py-3 font-semibold min-w-[140px]">% complete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.sites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No active sites.
                </td>
              </tr>
            )}
            {report.sites.map((site) => (
              <tr key={site.siteId} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/admin/sites/${site.siteId}`} className="hover:text-orange-600">
                    {site.siteName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmt(site.siteTotal)}</td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmt(site.claimed)}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-800 whitespace-nowrap">
                  {fmt(site.remaining)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${Math.min(100, site.pctComplete)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-10 text-right">
                      {site.pctComplete}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {report.sites.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="px-4 py-3">Grand total</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmt(report.grandSiteTotal)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmt(report.grandClaimed)}</td>
                <td className="px-4 py-3 text-right text-orange-900 whitespace-nowrap">{fmt(report.grandRemaining)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{grandPct}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

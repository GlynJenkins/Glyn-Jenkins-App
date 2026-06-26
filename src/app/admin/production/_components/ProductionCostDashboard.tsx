'use client'

import { useMemo, useState } from 'react'
import type { ProductionCostReport } from '@/lib/production/monthly-costs'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

type Props = {
  report: ProductionCostReport
}

export default function ProductionCostDashboard({ report }: Props) {
  const [hideEmpty, setHideEmpty] = useState(false)

  const visibleSites = useMemo(
    () =>
      hideEmpty
        ? report.sites.filter((s) => s.total > 0 || s.pendingTotal > 0)
        : report.sites,
    [hideEmpty, report.sites],
  )

  const currentMonth = report.months[report.months.length - 1] ?? ''
  const currentMonthTotal = report.totalsByMonth[currentMonth] ?? 0
  const currentMonthPending = report.pendingTotalsByMonth[currentMonth] ?? 0

  const hasAnyData =
    report.grandTotal > 0 ||
    report.pendingGrandTotal > 0 ||
    visibleSites.some((s) => s.total > 0 || s.pendingTotal > 0)

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
            {report.monthLabels[currentMonth] ?? 'This month'} · approved
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(currentMonthTotal)}</p>
          <p className="text-xs text-slate-400 mt-1">Paid booking-in wages</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs text-amber-700 uppercase tracking-wide font-medium">
            Pending approval
          </p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{fmt(report.pendingGrandTotal)}</p>
          <p className="text-xs text-amber-600 mt-1">
            {currentMonthPending > 0
              ? `${fmt(currentMonthPending)} in ${report.monthLabels[currentMonth]}`
              : 'Separate from approved totals'}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-orange-700 uppercase tracking-wide font-medium">
            Avg per month
          </p>
          <p className="text-2xl font-bold text-orange-900 mt-1">{fmt(report.overallAvg)}</p>
          <p className="text-xs text-orange-600 mt-1">Approved · months with spend</p>
        </div>
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed">
        Approved wages are spread across months by booking window days (50/50 when a fortnight
        sits 7 days each side of a month). Pending claims use the same rules but are kept in
        their own column — they are not added to approved totals until admin approves them.
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {visibleSites.length} site{visibleSites.length !== 1 ? 's' : ''} · last {report.months.length} months
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-slate-300"
          />
          Hide sites with no cost
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 font-semibold text-slate-700 min-w-[140px]">
                  Site
                </th>
                {report.months.map((m) => (
                  <th
                    key={m}
                    className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs"
                  >
                    {report.monthLabels[m]}
                  </th>
                ))}
                <th className="px-4 py-3 font-semibold text-amber-700 text-right whitespace-nowrap bg-amber-50/50">
                  Pending
                </th>
                <th className="px-4 py-3 font-semibold text-orange-700 text-right whitespace-nowrap bg-orange-50/50">
                  Avg
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">
                  Approved
                </th>
              </tr>
            </thead>
            <tbody>
              {!hasAnyData ? (
                <tr>
                  <td
                    colSpan={report.months.length + 4}
                    className="px-4 py-10 text-center text-slate-400 text-sm"
                  >
                    No booking-in wages yet for this period.
                  </td>
                </tr>
              ) : (
                visibleSites.map((site) => (
                  <tr key={site.siteId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800 truncate max-w-[160px]">
                      {site.siteName}
                    </td>
                    {report.months.map((m) => {
                      const val = site.byMonth[m] ?? 0
                      return (
                        <td
                          key={m}
                          className={`px-3 py-3 text-right tabular-nums text-xs ${
                            val > 0 ? 'text-slate-800' : 'text-slate-300'
                          }`}
                        >
                          {val > 0 ? fmt(val) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700 bg-amber-50/30">
                      {site.pendingTotal > 0 ? fmt(site.pendingTotal) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-700 bg-orange-50/30">
                      {site.monthlyAvg > 0 ? fmt(site.monthlyAvg) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                      {site.total > 0 ? fmt(site.total) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {hasAnyData && (
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-semibold">
                    All sites · approved
                  </td>
                  {report.months.map((m) => (
                    <td key={m} className="px-3 py-3 text-right tabular-nums text-xs font-medium">
                      {(report.totalsByMonth[m] ?? 0) > 0
                        ? fmt(report.totalsByMonth[m] ?? 0)
                        : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-300 bg-amber-900/30">
                    {report.pendingGrandTotal > 0 ? fmt(report.pendingGrandTotal) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-300">
                    {fmt(report.overallAvg)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">
                    {fmt(report.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

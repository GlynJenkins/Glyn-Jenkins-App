'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  filterWagesRegisterRows,
  formatWagesPeriodLabel,
  wagesRegisterFilterOptions,
  WAGES_ROLE_LABELS,
  type WagesRegisterRow,
} from '@/lib/claims/load-wages-register'
import { Download } from 'lucide-react'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPeriod(start: string | null, end: string | null) {
  return formatWagesPeriodLabel(start, end)
}

const selectClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-orange-400'

type Props = {
  rows:          WagesRegisterRow[]
  pendingCount?: number
}

export default function WagesRegisterTable({ rows, pendingCount = 0 }: Props) {
  const [foremanFilter, setForemanFilter] = useState('all')
  const [workerFilter, setWorkerFilter]   = useState('all')
  const [periodFilter, setPeriodFilter]   = useState('all')

  const { foremen, workers, periods } = useMemo(() => wagesRegisterFilterOptions(rows), [rows])

  const filteredRows = useMemo(
    () =>
      filterWagesRegisterRows(rows, {
        foremanId: foremanFilter !== 'all' ? foremanFilter : undefined,
        workerId:  workerFilter !== 'all' ? workerFilter : undefined,
        periodKey: periodFilter !== 'all' ? periodFilter : undefined,
      }),
    [rows, foremanFilter, workerFilter, periodFilter],
  )

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.grossPay,
          fees:  acc.fees  + r.fees,
          tax:   acc.tax   + r.tax,
          net:   acc.net   + r.netPay,
        }),
        { gross: 0, fees: 0, tax: 0, net: 0 },
      ),
    [filteredRows],
  )

  const hasFilters = foremanFilter !== 'all' || workerFilter !== 'all' || periodFilter !== 'all'

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (foremanFilter !== 'all') params.set('foreman', foremanFilter)
    if (workerFilter !== 'all') params.set('worker', workerFilter)
    if (periodFilter !== 'all') params.set('period', periodFilter)
    const qs = params.toString()
    return `/api/admin/claims/export${qs ? `?${qs}` : ''}`
  }, [foremanFilter, workerFilter, periodFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Wages register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Approved pay from booking in · alphabetical by name
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => { window.location.href = exportUrl }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
          )}
          <Link
            href="/admin/claims/pending"
            className="relative flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Pending
            {pendingCount > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Pay period
            </span>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All periods</option>
              {periods.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Foreman gang
            </span>
            <select
              value={foremanFilter}
              onChange={(e) => setForemanFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All foremen</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Individual
            </span>
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {hasFilters && (
        <p className="text-xs text-slate-500">
          Showing {filteredRows.length} of {rows.length} payment{rows.length !== 1 ? 's' : ''}
          {' · '}
          <button
            type="button"
            onClick={() => {
              setForemanFilter('all')
              setWorkerFilter('all')
              setPeriodFilter('all')
            }}
            className="text-orange-600 underline"
          >
            Clear filters
          </button>
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 font-semibold text-slate-700 min-w-[140px]">
                  Name
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs">
                  Role
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs">
                  Foreman
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs hidden md:table-cell">
                  Period
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Gross
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Fees
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Tax
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {rows.length === 0
                      ? 'No approved wages yet. Approve a booking-in claim to add entries here.'
                      : 'No payments match these filters.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      <Link
                        href={`/admin/workers/${row.workerId}`}
                        className="hover:text-orange-600 transition-colors"
                      >
                        {row.surname}, {row.firstName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap capitalize">
                      {WAGES_ROLE_LABELS[row.role] ?? row.role}
                    </td>
                    <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {row.foremanName}
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap hidden md:table-cell">
                      {formatPeriod(row.periodStart, row.periodEnd)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-800 text-xs">
                      {fmt(row.grossPay)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500 text-xs">
                      {row.fees > 0 ? `-${fmt(row.fees)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-blue-600 text-xs">
                      {row.tax > 0 ? `-${fmt(row.tax)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                      {fmt(row.netPay)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-semibold" colSpan={4}>
                    Total{hasFilters ? ' (filtered)' : ''}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium">
                    {fmt(totals.gross)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium text-slate-300">
                    {totals.fees > 0 ? `-${fmt(totals.fees)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium text-blue-300">
                    {totals.tax > 0 ? `-${fmt(totals.tax)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-300">
                    {fmt(totals.net)}
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

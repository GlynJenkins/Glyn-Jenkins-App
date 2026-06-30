'use client'

import Link from 'next/link'
import { Download } from 'lucide-react'
import type { DeveloperRegisterRow } from '@/lib/variations/submission-totals'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function paymentLabel(row: DeveloperRegisterRow) {
  if (row.paymentStatus === 'paid' || row.status === 'paid') return 'Paid'
  return 'Unpaid'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function statusLabel(status: string) {
  switch (status) {
    case 'submitted': return 'Awaiting agreement'
    case 'agreed':    return 'Agreed'
    case 'paid':      return 'Paid'
    default:          return status
  }
}

export default function DeveloperVariationRegisterTable({ rows }: { rows: DeveloperRegisterRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      foreman:   acc.foreman + r.foremanTotal,
      developer: acc.developer + r.developerTotal,
      profit:    acc.profit + r.profit,
      unpaid:    acc.unpaid + (paymentLabel(r) === 'Unpaid' ? r.developerTotal : 0),
    }),
    { foreman: 0, developer: 0, profit: 0, unpaid: 0 }
  )

  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            VO register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            All variations sent to the developer. Same data as the Excel export.
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => { window.location.href = '/api/admin/variations/developer/export' }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
          Nothing sent to a developer yet. Send a draft variation to add it here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Foreman cost</p>
              <p className="text-base font-bold text-slate-700">{fmt(totals.foreman)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Developer charge</p>
              <p className="text-base font-bold text-orange-600">{fmt(totals.developer)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total profit</p>
              <p className="text-base font-bold text-emerald-600">{fmt(totals.profit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Outstanding</p>
              <p className="text-base font-bold text-amber-600">{fmt(totals.unpaid)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100 text-left">
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Reference
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Site
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[140px]">
                      Reason for VO
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                      Foreman cost
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                      Developer
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                      Profit
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Paid
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Sent
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Submitted by
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const paid = paymentLabel(r) === 'Paid'
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80"
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Link
                            href={`/admin/variations/developer/${r.id}`}
                            className="font-semibold text-orange-600 hover:text-orange-700"
                          >
                            {r.reference}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700 max-w-[120px]">
                          <span className="line-clamp-2">{r.siteName}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[160px]">
                          <span className="line-clamp-2">{r.description}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700 whitespace-nowrap tabular-nums">
                          {fmt(r.foremanTotal)}
                        </td>
                        <td className="px-3 py-3 text-right text-orange-600 font-medium whitespace-nowrap tabular-nums">
                          {fmt(r.developerTotal)}
                        </td>
                        <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums ${
                          r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {fmt(r.profit)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {paymentLabel(r)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(r.submittedAt)}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.foremanName}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {statusLabel(r.status)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-gray-200 font-semibold">
                    <td className="px-3 py-3 text-slate-700" colSpan={3}>
                      Totals ({rows.length} VO{rows.length === 1 ? '' : 's'})
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{fmt(totals.foreman)}</td>
                    <td className="px-3 py-3 text-right text-orange-600 tabular-nums">{fmt(totals.developer)}</td>
                    <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">{fmt(totals.profit)}</td>
                    <td className="px-3 py-3" colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

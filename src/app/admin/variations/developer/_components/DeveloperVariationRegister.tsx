'use client'

import Link from 'next/link'
import { Download, ChevronRight } from 'lucide-react'
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

export default function DeveloperVariationRegister({ rows }: { rows: DeveloperRegisterRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      foreman:    acc.foreman + r.foremanTotal,
      developer:  acc.developer + r.developerTotal,
      profit:     acc.profit + r.profit,
      unpaid:     acc.unpaid + (paymentLabel(r) === 'Unpaid' ? r.developerTotal : 0),
    }),
    { foreman: 0, developer: 0, profit: 0, unpaid: 0 }
  )

  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Sent to developer — register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Stored in the app when you send to developer. Profit = developer charge minus foreman cost.
          </p>
        </div>
        {rows.length > 0 && (
          <a
            href="/api/admin/variations/developer/export"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
          Nothing sent to a developer yet. Use Send to developer on a draft to add it here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total profit</p>
              <p className="text-lg font-bold text-emerald-600">{fmt(totals.profit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Outstanding (unpaid)</p>
              <p className="text-lg font-bold text-amber-600">{fmt(totals.unpaid)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/admin/variations/developer/${r.id}`}
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{r.siteName}</p>
                    <p className="text-xs text-slate-500 truncate">{r.description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Sent {formatDate(r.submittedAt)} · {r.foremanName}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    paymentLabel(r) === 'Paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {paymentLabel(r)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Foreman cost</p>
                    <p className="text-sm font-semibold text-slate-700">{fmt(r.foremanTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Developer</p>
                    <p className="text-sm font-semibold text-orange-600">{fmt(r.developerTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Profit</p>
                    <p className={`text-sm font-bold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt(r.profit)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 ml-auto mt-1" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

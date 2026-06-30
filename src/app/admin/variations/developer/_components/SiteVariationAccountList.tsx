'use client'

import Link from 'next/link'
import { ChevronRight, Download } from 'lucide-react'
import type { SiteVariationAccountSummary } from '@/lib/variations/site-variation-accounts'
import { formatSiteCode } from '@/lib/variations/vo-reference'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

export default function SiteVariationAccountList({ accounts }: { accounts: SiteVariationAccountSummary[] }) {
  const grand = accounts.reduce(
    (acc, a) => ({
      developer: acc.developer + a.developerTotal,
      profit:    acc.profit + a.profit,
      paid:      acc.paid + a.paidAmount,
      pending:   acc.pending + a.pendingAmount,
    }),
    { developer: 0, profit: 0, paid: 0, pending: 0 }
  )

  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Variation accounts by site
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Each site has a code (e.g. 001). Variations are numbered V01, V02… and shown as 001-V01.
          </p>
        </div>
        {accounts.length > 0 && (
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

      {accounts.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
          No variation accounts yet. Prepare a developer variation from a pending foreman submission.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total profit</p>
              <p className="text-lg font-bold text-emerald-600">{fmt(grand.profit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Outstanding (pending)</p>
              <p className="text-lg font-bold text-amber-600">{fmt(grand.pending)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Paid to date</p>
              <p className="text-lg font-bold text-green-600">{fmt(grand.paid)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Developer charges</p>
              <p className="text-lg font-bold text-orange-600">{fmt(grand.developer)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {accounts.map((a) => (
              <Link
                key={a.siteId}
                href={`/admin/variations/developer/sites/${a.siteId}`}
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg">
                        {formatSiteCode(a.siteCode)}
                      </span>
                      <p className="font-semibold text-slate-900 truncate">{a.siteName}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {a.voCount} variation{a.voCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Pending</p>
                    <p className="text-sm font-semibold text-amber-600">{fmt(a.pendingAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Paid</p>
                    <p className="text-sm font-semibold text-green-600">{fmt(a.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Profit</p>
                    <p className={`text-sm font-bold ${a.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt(a.profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Developer total</p>
                    <p className="text-sm font-semibold text-orange-600">{fmt(a.developerTotal)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

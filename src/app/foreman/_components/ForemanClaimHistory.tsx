'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, ChevronUp, ClipboardList, History } from 'lucide-react'
import type { ForemanClaimHistoryItem } from '@/lib/claims/load-foreman-claim-history'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  )
}

type Props = {
  claims: ForemanClaimHistoryItem[]
}

export default function ForemanClaimHistory({ claims }: Props) {
  const [open, setOpen] = useState(false)

  if (claims.length === 0) return null

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <History className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Past claims</p>
            <p className="text-xs text-slate-400 truncate">
              {claims.length} previous fortnight{claims.length !== 1 ? 's' : ''} · tap to {open ? 'hide' : 'view'}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-50 divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {claims.map((claim) => (
            <Link
              key={claim.id}
              href={`/foreman/claim/${claim.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 bg-slate-50 rounded-lg flex items-center justify-center shrink-0">
                  <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {claim.periodLabel}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fmt(claim.poolTotal)} · {claim.workerCount} worker{claim.workerCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={claim.status} />
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

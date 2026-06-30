'use client'

import Link from 'next/link'
import { ChevronRight, PencilLine } from 'lucide-react'
import type { DeveloperInProgressRow } from '@/lib/variations/submission-totals'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function statusLabel(status: string) {
  switch (status) {
    case 'draft':     return 'Draft'
    case 'submitted': return 'Awaiting agreement'
    case 'agreed':    return 'Agreed — approve foreman'
    default:          return status
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'draft':     return 'bg-amber-100 text-amber-800'
    case 'submitted': return 'bg-blue-100 text-blue-700'
    case 'agreed':    return 'bg-emerald-100 text-emerald-700'
    default:          return 'bg-gray-100 text-gray-600'
  }
}

export default function DeveloperInProgressQueue({ rows }: { rows: DeveloperInProgressRow[] }) {
  if (rows.length === 0) return null

  return (
    <div className="space-y-3 mb-8">
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          In progress
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Drafts and variations not yet in the VO register. Tap to resume editing.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/admin/variations/developer/${row.id}`}
            className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <PencilLine className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-orange-600">{row.reference}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}>
                  {statusLabel(row.status)}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {row.siteName} · {row.foremanName}
              </p>
              <p className="text-xs text-slate-600 truncate">{row.description}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-slate-400">Developer</p>
              <p className="font-bold text-orange-600 text-sm">{fmt(row.developerTotal)}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

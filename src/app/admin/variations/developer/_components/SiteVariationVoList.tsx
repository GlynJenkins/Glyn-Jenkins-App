'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2 } from 'lucide-react'
import type { SiteVariationVoRow } from '@/lib/variations/site-variation-accounts'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function statusLabel(status: string) {
  switch (status) {
    case 'draft':     return 'Draft'
    case 'submitted': return 'Awaiting agreement'
    case 'agreed':    return 'Agreed'
    case 'paid':      return 'Paid'
    default:          return status
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'draft':     return 'bg-slate-100 text-slate-600'
    case 'submitted': return 'bg-amber-100 text-amber-700'
    case 'agreed':    return 'bg-blue-100 text-blue-700'
    case 'paid':      return 'bg-green-100 text-green-700'
    default:          return 'bg-gray-100 text-gray-600'
  }
}

function VoRow({ row }: { row: SiteVariationVoRow }) {
  const router = useRouter()
  const [isPaid, setIsPaid] = useState(row.isPaid)
  const [busy, startTransition] = useTransition()

  const togglePaid = () => {
    if (!row.canTogglePaid || busy) return
    const next = isPaid ? 'unpaid' : 'paid'
    startTransition(async () => {
      const res = await fetch(`/api/admin/variations/developer/${row.id}/payment`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payment_status: next }),
      })
      if (res.ok) {
        setIsPaid(!isPaid)
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-orange-600">{row.reference}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}>
              {statusLabel(row.status)}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{row.description}</p>
          <p className="text-[10px] text-slate-400 mt-1">{row.foremanName}</p>
        </div>
        <Link
          href={`/admin/variations/developer/${row.id}`}
          className="shrink-0 p-2 text-slate-400 hover:text-slate-600"
          aria-label="Open variation"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
        <div>
          <p className="text-[10px] text-slate-400">Foreman</p>
          <p className="text-sm font-semibold text-slate-700">{fmt(row.foremanTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Developer</p>
          <p className="text-sm font-semibold text-orange-600">{fmt(row.developerTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400">Profit</p>
          <p className={`text-sm font-bold ${row.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmt(row.profit)}
          </p>
        </div>
      </div>

      <label className={`mt-3 flex items-center gap-2.5 pt-3 border-t border-gray-50 ${
        row.canTogglePaid ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
      }`}>
        <input
          type="checkbox"
          checked={isPaid}
          disabled={!row.canTogglePaid || busy}
          onChange={togglePaid}
          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span className="text-xs font-medium text-slate-700">
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Updating…
            </span>
          ) : isPaid ? (
            'Paid by developer'
          ) : (
            'Mark as paid when received'
          )}
        </span>
      </label>
    </div>
  )
}

export default function SiteVariationVoList({ rows }: { rows: SiteVariationVoRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-gray-100">
        No variations on this site yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <VoRow key={row.id} row={row} />
      ))}
    </div>
  )
}

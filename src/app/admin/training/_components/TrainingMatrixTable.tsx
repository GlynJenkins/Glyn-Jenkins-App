'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import type { TrainingMatrixRow, TrainingMatrixSummary } from '@/lib/training/load-training-matrix'
import { formatCscsExpiry, hsStatusLabel } from '@/lib/training/load-training-matrix'

type SortMode = 'newest' | 'cscs_soonest'

type Props = {
  rows: TrainingMatrixRow[]
  summary: TrainingMatrixSummary
}

const CSCS_BADGE: Record<TrainingMatrixRow['cscsStatus'], string> = {
  expired:        'bg-red-100 text-red-700 border-red-200',
  expiring_soon:  'bg-amber-100 text-amber-800 border-amber-200',
  valid:          'bg-green-100 text-green-700 border-green-200',
  missing:        'bg-slate-100 text-slate-500 border-slate-200',
}

const CSCS_LABEL: Record<TrainingMatrixRow['cscsStatus'], string> = {
  expired:        'Expired',
  expiring_soon:  'Expiring soon',
  valid:          'Valid',
  missing:        'Not provided',
}

function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const expiry = Date.UTC(y, m - 1, d)
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((expiry - todayUtc) / (24 * 60 * 60 * 1000))
}

export default function TrainingMatrixTable({ rows, summary }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [viewingId, setViewingId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const copy = [...rows]
    if (sortMode === 'newest') {
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return copy
    }
    copy.sort((a, b) => {
      const da = daysUntilExpiry(a.cscsExpiryDate)
      const db = daysUntilExpiry(b.cscsExpiryDate)
      if (da == null && db == null) return a.name.localeCompare(b.name)
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
    return copy
  }, [rows, sortMode])

  const viewHs = async (workerId: string) => {
    setViewingId(workerId)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/hs-qualification`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not open certificate')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open certificate.')
    } finally {
      setViewingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-red-600">{summary.expired}</span> CSCS expired
          {' · '}
          <span className="font-semibold text-amber-700">{summary.expiringSoon}</span> expiring soon
          {' · '}
          <span className="font-semibold text-green-700">{summary.valid}</span> valid
          {' · '}
          <span className="font-semibold text-slate-500">{summary.missing}</span> CSCS missing
          {' · '}
          <span className="font-semibold text-amber-700">{summary.hsMissing}</span> missing SSSTS/SMSTS
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/training/export?format=xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200
                       text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </a>
          <a
            href="/api/admin/training/export?format=pdf"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200
                       text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileText className="w-4 h-4" />
            PDF
          </a>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSortMode('newest')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            sortMode === 'newest'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200'
          }`}
        >
          Newest first
        </button>
        <button
          type="button"
          onClick={() => setSortMode('cscs_soonest')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            sortMode === 'cscs_soonest'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200'
          }`}
        >
          CSCS expiry soonest
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Trade</th>
              <th className="px-3 py-3 font-semibold">Qualification</th>
              <th className="px-3 py-3 font-semibold">CSCS Card Number</th>
              <th className="px-3 py-3 font-semibold">CSCS Expiry</th>
              <th className="px-3 py-3 font-semibold">H&amp;S (SSSTS/SMSTS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  No active workers yet.
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/80">
                <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap">
                  <Link href={`/admin/workers/${row.id}`} className="hover:text-orange-600">
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.trade}</td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.qualification}</td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{row.cscsNumber ?? '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${CSCS_BADGE[row.cscsStatus]}`}>
                    {formatCscsExpiry(row.cscsExpiryDate)}
                    <span className="font-normal opacity-80">· {CSCS_LABEL[row.cscsStatus]}</span>
                  </span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {row.hsStatus === 'on_file' ? (
                    <button
                      type="button"
                      onClick={() => viewHs(row.id)}
                      disabled={viewingId === row.id}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {viewingId === row.id ? 'Opening…' : 'On file · View'}
                    </button>
                  ) : row.hsStatus === 'na' ? (
                    <span className="text-slate-500">N/A</span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold">
                      {hsStatusLabel(row.hsStatus)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

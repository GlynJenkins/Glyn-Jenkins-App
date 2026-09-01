'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Eye, FileSpreadsheet, Search } from 'lucide-react'
import type {
  RtwRegisterFilter,
  RtwRegisterRow,
  RtwRegisterSummary,
} from '@/lib/workers/load-right-to-work-register'
import { filterRtwRegisterRows } from '@/lib/workers/load-right-to-work-register'
import {
  formatRtwDateTime,
  GOV_UK_VIEW_RIGHT_TO_WORK,
  rtwMethodLabel,
  rtwStatusLabel,
} from '@/lib/induction/right-to-work'
import { openSignedDocument } from '@/lib/admin/open-signed-document'

type Props = {
  rows: RtwRegisterRow[]
  summary: RtwRegisterSummary
  initialFilter?: RtwRegisterFilter
}

const FILTERS: { key: RtwRegisterFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'pending', label: 'Pending' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'expired', label: 'Expired' },
]

function StatusChip({ row }: { row: RtwRegisterRow }) {
  if (row.expiryFlag === 'expired') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
        Expired
      </span>
    )
  }
  if (row.expiryFlag === 'expiring_soon') {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-900">
        Re-check due soon
      </span>
    )
  }
  const cls =
    row.rtwStatus === 'verified'
      ? 'bg-green-100 text-green-800'
      : row.rtwStatus === 'follow_up'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rtwStatusLabel(row.rtwStatus)}
    </span>
  )
}

function DocumentCell({ row }: { row: RtwRegisterRow }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (row.method === 'share_code') {
    return (
      <div className="space-y-1">
        <p className="font-mono text-xs tracking-wider text-slate-800">
          {row.shareCode || '—'}
        </p>
        <a
          href={GOV_UK_VIEW_RIGHT_TO_WORK}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-orange-700 hover:underline"
        >
          Check gov.uk
        </a>
      </div>
    )
  }

  if (!row.documentUrl) {
    return <span className="text-slate-400 text-xs">—</span>
  }

  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await openSignedDocument(
        `/api/admin/workers/${row.id}/documents?type=rtw`,
        {
          onError: (message) => setError(message),
        },
      )
      if (!ok) return
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline disabled:opacity-50"
      >
        <Eye className="w-3.5 h-3.5" />
        View
      </button>
      {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
    </div>
  )
}

function HistoryPanel({ row }: { row: RtwRegisterRow }) {
  if (row.checks.length === 0) {
    return (
      <p className="text-xs text-slate-500 px-4 py-3">
        No check history yet — mark verified on the worker profile to log the first check.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-gray-50">
      {row.checks.map((c) => (
        <li key={c.id} className="px-4 py-2.5 text-xs text-slate-700 space-y-0.5">
          <p>
            <span className="font-semibold">{c.checkedBy}</span>
            {' · '}
            {formatRtwDateTime(c.checkedAt)}
            {' · '}
            <span className="capitalize">{c.outcome.replace('_', ' ')}</span>
          </p>
          <p className="text-slate-500">
            Method: {rtwMethodLabel(c.method)}
            {c.note ? ` · ${c.note}` : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}

export default function RightToWorkRegisterTable({
  rows,
  summary,
  initialFilter = 'all',
}: Props) {
  const [filter, setFilter] = useState<RtwRegisterFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(
    () => filterRtwRegisterRows(rows, filter, query),
    [rows, filter, query],
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: summary.total, color: 'text-slate-800' },
          { label: 'Verified', value: summary.verified, color: 'text-green-700' },
          { label: 'Pending', value: summary.pending, color: 'text-amber-700' },
          { label: 'Follow-up', value: summary.followUp, color: 'text-orange-700' },
          { label: 'Expiring soon', value: summary.expiringSoon, color: 'text-orange-800' },
          { label: 'Expired', value: summary.expired, color: 'text-red-700' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white
                       outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <a
          href="/api/admin/right-to-work/export"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm
                     font-medium bg-slate-900 text-white hover:bg-slate-800"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export register
        </a>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-gray-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3 w-8" />
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Address</th>
              <th className="px-3 py-3 font-semibold">Method</th>
              <th className="px-3 py-3 font-semibold">Document</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Verified by</th>
              <th className="px-3 py-3 font-semibold">Verified</th>
              <th className="px-3 py-3 font-semibold">Re-check by</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  No workers match
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const open = expanded === row.id
                return (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : row.id)}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                        aria-label="Toggle check history"
                      >
                        {open
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/workers/${row.id}`}
                        className="font-medium text-slate-900 hover:text-orange-700 hover:underline"
                      >
                        {row.name}
                      </Link>
                      {open && (
                        <div className="mt-2 rounded-xl border border-gray-100 bg-slate-50 overflow-hidden">
                          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Check history
                          </p>
                          <HistoryPanel row={row} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.roleLabel}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-pre-line max-w-[12rem] text-xs">
                      {row.homeAddress || <span className="text-amber-700 font-semibold">Not on file</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.methodLabel}</td>
                    <td className="px-3 py-3"><DocumentCell row={row} /></td>
                    <td className="px-3 py-3"><StatusChip row={row} /></td>
                    <td className="px-3 py-3 text-slate-600 text-xs">{row.verifiedBy || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs">{row.verifiedAtLabel}</td>
                    <td className="px-3 py-3 text-xs">
                      {row.rtwType === 'time_limited' ? (
                        <span className={
                          row.expiryFlag === 'expired'
                            ? 'font-semibold text-red-700'
                            : row.expiryFlag === 'expiring_soon'
                              ? 'font-semibold text-orange-800'
                              : 'text-slate-600'
                        }>
                          {row.expiryLabel}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No workers match</div>
        ) : (
          filtered.map((row) => {
            const open = expanded === row.id
            return (
              <div
                key={row.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/admin/workers/${row.id}`}
                      className="font-semibold text-slate-900 hover:text-orange-700"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-500">{row.roleLabel}</p>
                  </div>
                  <StatusChip row={row} />
                </div>
                <p className="text-xs text-slate-600 whitespace-pre-line">
                  {row.homeAddress || 'Address not on file'}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>{row.methodLabel}</span>
                  <DocumentCell row={row} />
                </div>
                <p className="text-xs text-slate-500">
                  Verified: {row.verifiedBy || '—'} · {row.verifiedAtLabel}
                </p>
                {row.rtwType === 'time_limited' && (
                  <p className="text-xs text-slate-600">
                    Re-check by{' '}
                    <span className={
                      row.expiryFlag === 'expired'
                        ? 'font-semibold text-red-700'
                        : row.expiryFlag === 'expiring_soon'
                          ? 'font-semibold text-orange-800'
                          : ''
                    }>
                      {row.expiryLabel}
                    </span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.id)}
                  className="text-xs font-medium text-orange-700 hover:underline"
                >
                  {open ? 'Hide check history' : 'Show check history'}
                </button>
                {open && (
                  <div className="rounded-xl border border-gray-100 bg-slate-50 overflow-hidden">
                    <HistoryPanel row={row} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

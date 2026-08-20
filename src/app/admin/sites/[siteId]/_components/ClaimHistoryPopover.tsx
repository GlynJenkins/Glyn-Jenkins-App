'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { ClaimHistoryEntry } from '@/lib/claims/load-site-claim-history'
import { formatClaimHistoryLine } from '@/lib/claims/load-site-claim-history'

export function ClaimHistoryLines({
  entries,
  compact = false,
}: {
  entries: ClaimHistoryEntry[]
  compact?: boolean
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400">Not yet claimed</p>
  }

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {entries.map((entry) => (
        <li
          key={`${entry.claimId}-${entry.periodEnd}-${entry.pct}-${entry.value}`}
          className={`text-xs leading-snug ${
            entry.voided ? 'text-slate-400' : 'text-slate-700'
          }`}
        >
          <span>{formatClaimHistoryLine(entry)}</span>
          {' '}
          <Link
            href={
              entry.status === 'pending'
                ? `/admin/claims/pending#${entry.claimId}`
                : `/admin/claims/pending`
            }
            className="text-orange-700 font-medium hover:underline no-underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Absolute floating tooltip for desktop hover (no layout shift). */
export function ClaimHistoryHoverCard({
  entries,
  emptyReason,
  style,
}: {
  entries: ClaimHistoryEntry[]
  emptyReason?: string
  style: CSSProperties
}) {
  return (
    <div
      role="tooltip"
      style={style}
      className="fixed z-[80] max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2
                 shadow-lg pointer-events-none"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
        Claim history
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 leading-snug">
          {emptyReason ?? 'Not yet claimed'}
        </p>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              key={`${entry.claimId}-${entry.periodEnd}-${entry.pct}-${entry.value}`}
              className={`text-xs leading-snug ${
                entry.voided ? 'text-slate-400' : 'text-slate-700'
              }`}
            >
              {formatClaimHistoryLine(entry)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Mobile / tap popover with dismiss backdrop. */
export function ClaimHistoryTapPopover({
  plotNumber,
  stageName,
  entries,
  onClose,
  onEdit,
}: {
  plotNumber: string
  stageName: string
  entries: ClaimHistoryEntry[]
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <p className="text-xs text-slate-500">Plot {plotNumber}</p>
        <p className="text-base font-bold text-slate-900 mb-3">{stageName}</p>
        <ClaimHistoryLines entries={entries} />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="py-3 rounded-xl border-2 border-gray-200 text-slate-700 font-semibold text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm"
          >
            Edit cell
          </button>
        </div>
      </div>
    </>
  )
}

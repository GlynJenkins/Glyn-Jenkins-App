'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown, ChevronUp, PoundSterling, CheckCircle2,
  Loader2, AlertCircle, Clock, Users,
} from 'lucide-react'
import { calculatePayLine } from '@/lib/cis/calculate-pay'
import type { ForemanClaimDetail, ForemanClaimPoolItem } from '@/lib/claims/load-foreman-claim'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:  { label: 'Awaiting approval', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${s.cls}`}>
      {s.label}
    </span>
  )
}

function PoolBreakdown({ items }: { items: ForemanClaimPoolItem[] }) {
  const [open, setOpen] = useState(true)

  if (items.length === 0) return null

  const gridItems  = items.filter((p) => p.type === 'grid_cell')
  const otherItems = items.filter((p) => p.type !== 'grid_cell')
  const isMultiSite = gridItems.some((p) => p.siteName)

  const renderItem = (item: ForemanClaimPoolItem, i: number, indent = false) => {
    const claimedPct = item.fullValue && item.fullValue > 0
      ? Math.round((item.amount / item.fullValue) * 100)
      : null
    return (
      <div
        key={`${item.label}-${i}`}
        className={`flex items-start justify-between text-xs text-slate-600 py-0.5 ${indent ? 'pl-2' : ''}`}
      >
        <div className="min-w-0 pr-3">
          <span className="block truncate">{item.label}</span>
          {claimedPct != null && claimedPct < 100 && (
            <span className="text-orange-500 font-medium">{claimedPct}% of lift value</span>
          )}
        </div>
        <span className="font-medium shrink-0">{fmt(item.amount)}</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-gray-50"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <PoundSterling className="w-4 h-4 text-orange-500" />
          Pool breakdown ({items.length})
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-1 border-t border-gray-100 pt-3">
          {!isMultiSite ? (
            items.map((item, i) => renderItem(item, i))
          ) : (
            <>
              {Array.from(
                gridItems.reduce((map, item) => {
                  const key = item.siteName ?? 'Unknown site'
                  if (!map.has(key)) map.set(key, [])
                  map.get(key)!.push(item)
                  return map
                }, new Map<string, ForemanClaimPoolItem[]>()),
              ).map(([siteName, siteItems]) => (
                <div key={siteName} className="mb-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                    {siteName}
                  </p>
                  {siteItems.map((item, i) => renderItem(item, i, true))}
                </div>
              ))}
              {otherItems.map((item, i) => renderItem(item, i))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  claim:        ForemanClaimDetail
  adminFee:     number
  insuranceFee: number
  canWithdraw:  boolean
  onWithdraw?:  () => void
  withdrawing?: boolean
  withdrawErr?: string | null
}

export default function ForemanClaimView({
  claim, adminFee, insuranceFee, canWithdraw, onWithdraw, withdrawing, withdrawErr,
}: Props) {
  const period = `${new Date(claim.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(claim.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const allocations = [...claim.allocations].sort((a, b) =>
    (a.workers?.surname ?? '').localeCompare(b.workers?.surname ?? ''),
  )

  const totalNet = allocations.reduce((sum, alloc) => {
    const w = alloc.workers
    if (!w) return sum
    const pay = calculatePayLine(
      alloc.gross_amount ?? 0,
      {
        id: w.id,
        tax_type: w.tax_type,
        has_personal_insurance: w.has_own_insurance,
        role: w.role,
      },
      { adminFee, insuranceFee },
    )
    return sum + pay.net
  }, 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Pay period</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">{period}</p>
            <p className="text-xs text-slate-500 mt-1">{claim.siteName}</p>
          </div>
          {statusBadge(claim.status)}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400">Submitted</p>
            <p className="text-slate-700 font-medium">{fmtDate(claim.submitted_at)}</p>
          </div>
          {claim.status === 'approved' && (
            <div>
              <p className="text-slate-400">Approved</p>
              <p className="text-slate-700 font-medium">{fmtDate(claim.approved_at)}</p>
            </div>
          )}
          {claim.status === 'rejected' && (
            <div>
              <p className="text-slate-400">Rejected</p>
              <p className="text-slate-700 font-medium">{fmtDate(claim.rejected_at)}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs text-slate-500">Pool total</p>
            <p className="text-xl font-bold text-orange-600">{fmt(claim.pool_total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Est. net pay</p>
            <p className="text-lg font-bold text-slate-900">{fmt(totalNet)}</p>
          </div>
        </div>
      </div>

      {claim.status === 'rejected' && claim.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Rejection reason
          </p>
          <p className="text-xs mt-1 leading-relaxed">{claim.rejection_reason}</p>
        </div>
      )}

      <PoolBreakdown items={claim.pool_items} />

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-800">
            Workers ({allocations.length})
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {allocations.map((alloc) => {
            const w = alloc.workers
            if (!w) return null
            const gross = alloc.gross_amount ?? 0
            const pay = calculatePayLine(
              gross,
              {
                id: w.id,
                tax_type: w.tax_type,
                has_personal_insurance: w.has_own_insurance,
                role: w.role,
              },
              { adminFee, insuranceFee },
            )

            return (
              <div key={alloc.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {w.surname}, {w.first_name}
                    </p>
                    <p className="text-xs text-slate-400 capitalize">{w.role}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{fmt(pay.net)}</p>
                    <p className="text-[10px] text-slate-400">gross {fmt(gross)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 bg-slate-900 flex justify-between items-center">
          <span className="text-slate-400 text-xs">Total est. net</span>
          <span className="text-orange-400 font-bold">{fmt(totalNet)}</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed px-2">
        Net figures are estimates — final pay is set when admin approves the claim.
      </p>

      {claim.status === 'pending' && canWithdraw && onWithdraw && (
        <button
          type="button"
          disabled={withdrawing}
          onClick={onWithdraw}
          className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-700
                     disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {withdrawing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Clock className="w-4 h-4" />}
          Withdraw &amp; edit claim
        </button>
      )}

      {withdrawErr && (
        <p className="text-xs text-red-600 text-center">{withdrawErr}</p>
      )}

      {claim.status === 'rejected' && (
        <Link
          href="/foreman/claim"
          className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-700 text-white
                     text-sm font-semibold rounded-xl transition-colors"
        >
          Resubmit claim
        </Link>
      )}

      {claim.status === 'approved' && (
        <div className="flex items-center gap-2 justify-center text-xs text-green-700">
          <CheckCircle2 className="w-4 h-4" />
          Approved — payments are in the wages register
        </div>
      )}
    </div>
  )
}

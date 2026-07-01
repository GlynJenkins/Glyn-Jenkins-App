'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronUp, CheckCircle, XCircle,
  Loader2, Clock, PoundSterling, Mail, MessageSquare, AlertCircle,
} from 'lucide-react'
import { calculatePayLine } from '@/lib/cis/calculate-pay'

// ── Types ─────────────────────────────────────────────────────────────────────

type Worker = {
  id:                string
  first_name:        string
  surname:           string
  role:              string
  tax_type:          string
  has_own_insurance: boolean | null
}

type Allocation = {
  id:           string
  worker_id:    string
  gross_amount: number
  workers:      Worker | null
}

type PoolItem = { type: string; label: string; amount: number; siteName?: string; fullValue?: number }

type RejectionNotifications = {
  emailSent:       boolean
  smsSent:         boolean
  emailTo:         string | null
  emailConfigured: boolean
  smsConfigured:   boolean
  emailError?:     string | null
  noEmailOnFile?:  boolean
  noPhoneOnFile?:  boolean
}

type Claim = {
  id:               string
  status:           string
  pool_total:       number
  pool_items:       PoolItem[]
  period_start:     string
  period_end:       string
  submitted_at:     string
  approved_at:      string | null
  rejected_at:      string | null
  rejection_reason: string | null
  sites:            { id: string; name: string } | null
  workers:          { id: string; first_name: string; surname: string; email?: string | null; phone?: string | null } | null
  claim_allocations: Allocation[]
  rejection_notifications?: RejectionNotifications
}

interface Props {
  pending:      Claim[]
  rejected:     Claim[]
  adminFee:     number
  insuranceFee: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function calcWorker(
  alloc: Allocation,
  adminFee: number,
  insuranceFee: number,
  customDed: number
) {
  const w = alloc.workers
  const pay = calculatePayLine(
    alloc.gross_amount ?? 0,
    {
      id:                     w?.id ?? '',
      tax_type:               w?.tax_type ?? null,
      has_personal_insurance: w?.has_own_insurance,
      role:                   w?.role,
    },
    { adminFee, insuranceFee },
    customDed,
  )
  return {
    gross:     pay.gross,
    wAdminFee: pay.adminFee,
    wInsFee:   pay.insuranceFee,
    taxable:   Math.max(0, pay.gross - pay.adminFee - pay.insuranceFee - pay.customDeduction),
    cisTax:    pay.cisTax,
    net:       pay.net,
  }
}

function NotificationStatus({ n }: { n: RejectionNotifications }) {
  return (
    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 space-y-1.5 text-xs">
      <p className="font-semibold text-slate-700">Foreman notified</p>
      {n.emailSent && n.emailTo && (
        <p className="flex items-center gap-1.5 text-green-700">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          Rejection email sent to {n.emailTo}
        </p>
      )}
      {n.emailConfigured && !n.emailSent && (
        <p className="flex items-center gap-1.5 text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {n.noEmailOnFile
            ? 'No email on file — rejection email not sent'
            : n.emailError
            ? `Email failed: ${n.emailError}`
            : 'Rejection email not sent'}
        </p>
      )}
      {n.smsSent && (
        <p className="flex items-center gap-1.5 text-green-700">
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          Rejection SMS sent
        </p>
      )}
      {n.smsConfigured && !n.smsSent && n.noPhoneOnFile && (
        <p className="flex items-center gap-1.5 text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          No mobile on file — SMS not sent
        </p>
      )}
      {!n.emailConfigured && !n.smsConfigured && (
        <p className="text-slate-500">Email/SMS not configured in environment</p>
      )}
    </div>
  )
}

// ── Claim card ────────────────────────────────────────────────────────────────

function ClaimCard({
  claim, adminFee, insuranceFee, onAction, defaultExpanded = false,
}: {
  claim:           Claim
  adminFee:        number
  insuranceFee:    number
  onAction?:       (claimId: string, action: 'approve' | 'reject', extra?: object) => void
  defaultExpanded?: boolean
}) {
  const [expanded,      setExpanded]      = useState(defaultExpanded)
  const [poolOpen,      setPoolOpen]      = useState(false)
  const [rejectMode,    setRejectMode]    = useState(false)
  const [reason,        setReason]        = useState('')
  const [busy,          startTransition]  = useTransition()

  // Custom deductions per worker: { workerId → { amount, reason } }
  const [deductions, setDeductions] = useState<
    Record<string, { amount: string; reason: string; open: boolean }>
  >({})

  const setDed = (wid: string, field: 'amount' | 'reason' | 'open', val: string | boolean) =>
    setDeductions((p) => ({
      ...p,
      [wid]: { ...(p[wid] ?? { amount: '', reason: '', open: false }), [field]: val },
    }))

  const period   = `${new Date(claim.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(claim.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const submittedLabel = claim.submitted_at
    ? new Date(claim.submitted_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null
  const foreman  = claim.workers
  const allocations = claim.claim_allocations ?? []
  const foremanName = foreman
    ? `${foreman.first_name} ${foreman.surname}`
    : 'Unknown foreman'
  const siteLabel = claim.sites?.name
    ?? (() => {
      const sites = [...new Set(
        (claim.pool_items ?? [])
          .map((p) => p.siteName)
          .filter(Boolean)
      )]
      if (sites.length === 0) return 'Multi-site claim'
      if (sites.length === 1) return sites[0]!
      return `${sites.length} sites`
    })()

  const grandNet = allocations.reduce((sum, a) => {
    const ded = parseFloat(deductions[a.worker_id]?.amount ?? '0') || 0
    return sum + calcWorker(a, adminFee, insuranceFee, ded).net
  }, 0)

  const statusBadge: Record<string, string> = {
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  const handleApprove = () => {
    const workerDeductions: Record<string, { amount: number; reason: string }> = {}
    for (const [wid, d] of Object.entries(deductions)) {
      const amt = parseFloat(d.amount) || 0
      if (amt > 0) workerDeductions[wid] = { amount: amt, reason: d.reason }
    }
    startTransition(() => onAction?.(claim.id, 'approve', { workerDeductions }))
  }

  const handleReject = () => {
    startTransition(() => onAction?.(claim.id, 'reject', { reason }))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Compact summary — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 truncate">{foremanName}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize ${statusBadge[claim.status] ?? ''}`}>
              {claim.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {siteLabel} · {period}
            {allocations.length > 0 && ` · ${allocations.length} worker${allocations.length === 1 ? '' : 's'}`}
            {submittedLabel && ` · Submitted ${submittedLabel}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">Pool total</p>
          <p className="font-bold text-orange-600 text-lg leading-tight">{fmt(claim.pool_total ?? 0)}</p>
          {expanded && (
            <p className="text-xs text-slate-400 mt-0.5">Net {fmt(grandNet)}</p>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
          : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <>
      {/* Pool breakdown toggle */}
      {(claim.pool_items ?? []).length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setPoolOpen((p) => !p)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs text-slate-500 hover:bg-gray-50"
          >
            <span className="flex items-center gap-1.5">
              <PoundSterling className="w-3.5 h-3.5" />
              Pool breakdown ({claim.pool_items.length} items)
            </span>
            {poolOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {poolOpen && (
            <div className="px-5 pb-3 space-y-1">
              {(() => {
                // Group grid_cell items by siteName; non-grid items (variations, apprentice) listed after
                const gridItems   = claim.pool_items.filter((p) => p.type === 'grid_cell')
                const otherItems  = claim.pool_items.filter((p) => p.type !== 'grid_cell')
                const isMultiSite = gridItems.some((p) => p.siteName)

                const renderItem = (item: PoolItem, i: number, indent = false) => {
                  const claimedPct  = item.fullValue && item.fullValue > 0
                    ? Math.round((item.amount / item.fullValue) * 100) : null
                  const remainingPct = claimedPct != null ? 100 - claimedPct : null
                  return (
                    <div key={i} className={`flex items-start justify-between text-xs text-slate-600 py-0.5 ${indent ? 'pl-2' : ''}`}>
                      <div className="min-w-0 pr-3">
                        <span className="truncate block">{item.label}</span>
                        {claimedPct != null && claimedPct < 100 && (
                          <span className="text-orange-500 font-medium">
                            {claimedPct}% claimed · {remainingPct}% remaining
                          </span>
                        )}
                      </div>
                      <span className="font-medium shrink-0">{fmt(item.amount)}</span>
                    </div>
                  )
                }

                if (!isMultiSite) {
                  return claim.pool_items.map((item, i) => renderItem(item, i))
                }

                // Group grid items by site
                const siteGroups = new Map<string, PoolItem[]>()
                for (const item of gridItems) {
                  const key = item.siteName ?? 'Unknown Site'
                  if (!siteGroups.has(key)) siteGroups.set(key, [])
                  siteGroups.get(key)!.push(item)
                }

                return (
                  <>
                    {Array.from(siteGroups.entries()).map(([siteName, items]) => (
                      <div key={siteName} className="mb-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 mt-2">
                          {siteName}
                        </p>
                        {items.map((item, i) => renderItem(item, i, true))}
                      </div>
                    ))}
                    {otherItems.map((item, i) => renderItem(item, i))}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Worker allocations */}
      {allocations.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {allocations
            .sort((a, b) => (a.workers?.surname ?? '').localeCompare(b.workers?.surname ?? ''))
            .map((alloc) => {
              const w   = alloc.workers
              if (!w) return null
              const ded = deductions[w.id]
              const dedAmt = parseFloat(ded?.amount ?? '0') || 0
              const { gross, wAdminFee, wInsFee, cisTax, net } =
                calcWorker(alloc, adminFee, insuranceFee, dedAmt)

              return (
                <div key={alloc.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {w.surname}, {w.first_name}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">
                        {w.role} · {w.tax_type === 'cis_20' ? 'CIS 20%' : 'Gross'}
                        {w.has_own_insurance ? ' · Own insurance' : ''}
                      </p>
                    </div>
                    <p className="text-base font-bold text-slate-900">{fmt(net)}</p>
                  </div>

                  {/* Calculation breakdown */}
                  <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Gross</span><span>{fmt(gross)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Admin fee</span><span>-{fmt(wAdminFee)}</span>
                    </div>
                    {wInsFee > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Insurance</span><span>-{fmt(wInsFee)}</span>
                      </div>
                    )}
                    {dedAmt > 0 && (
                      <div className="flex justify-between text-red-500">
                        <span>{ded?.reason || 'Custom deduction'}</span>
                        <span>-{fmt(dedAmt)}</span>
                      </div>
                    )}
                    {cisTax > 0 && (
                      <div className="flex justify-between text-blue-600">
                        <span>CIS 20% tax</span><span>-{fmt(cisTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-slate-800 border-t border-gray-200 pt-1 mt-1">
                      <span>Net Pay</span><span>{fmt(net)}</span>
                    </div>
                  </div>

                  {/* Custom deduction */}
                  {claim.status === 'pending' && onAction && (
                    <div>
                      {!ded?.open ? (
                        <button
                          onClick={() => setDed(w.id, 'open', true)}
                          className="text-xs text-blue-500 underline"
                        >
                          + Add custom deduction
                        </button>
                      ) : (
                        <div className="flex gap-2 items-start">
                          <input
                            type="number" min={0} placeholder="£ amount"
                            value={ded?.amount ?? ''}
                            onChange={(e) => setDed(w.id, 'amount', e.target.value)}
                            className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                          />
                          <input
                            placeholder="Reason"
                            value={ded?.reason ?? ''}
                            onChange={(e) => setDed(w.id, 'reason', e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                          />
                          <button
                            onClick={() => setDed(w.id, 'open', false)}
                            className="text-xs text-slate-400 px-1"
                          >✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* Grand net total */}
      <div className="px-5 py-3 bg-slate-900 flex justify-between items-center">
        <span className="text-slate-400 text-xs">Total Net Pay</span>
        <span className="text-orange-400 font-bold text-lg">{fmt(grandNet)}</span>
      </div>

      {/* Rejection reason + notification status (rejected claims) */}
      {claim.status === 'rejected' && claim.rejection_reason && (
        <div className="px-5 py-3 bg-red-50 border-t border-red-100 text-xs text-red-600">
          Reason: {claim.rejection_reason}
        </div>
      )}
      {claim.status === 'rejected' && claim.rejection_notifications && (
        <NotificationStatus n={claim.rejection_notifications} />
      )}

      {/* Actions — pending only */}
      {claim.status === 'pending' && onAction && (
        <div className="p-4 space-y-2 border-t border-gray-100">
          {!rejectMode ? (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={handleApprove}
                className="flex-1 flex items-center justify-center gap-1.5 py-3
                           bg-green-600 hover:bg-green-700 text-white text-sm font-semibold
                           rounded-xl transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve & Pay
              </button>
              <button
                disabled={busy}
                onClick={() => setRejectMode(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3
                           bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold
                           rounded-xl border border-red-200 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 leading-relaxed">
                {foreman?.email || foreman?.phone ? (
                  <>
                    Foreman will be notified by
                    {foreman?.email ? ` email (${foreman.email})` : ''}
                    {foreman?.email && foreman?.phone ? ' and' : ''}
                    {foreman?.phone ? ` SMS (${foreman.phone})` : ''}
                  </>
                ) : (
                  'No email or phone on file — foreman will not be notified automatically.'
                )}
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection (included in email and SMS)..."
                rows={2}
                className="w-full px-3 py-2 border border-red-300 rounded-xl text-sm
                           outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  disabled={busy || !reason.trim()}
                  onClick={handleReject}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300
                             text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => { setRejectMode(false); setReason('') }}
                  className="px-4 py-2 bg-gray-100 text-slate-700 text-sm font-medium rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ── List with tabs ────────────────────────────────────────────────────────────

type Tab = 'pending' | 'rejected'

export default function ClaimApprovalList({
  pending, rejected, adminFee: initialAdminFee, insuranceFee: initialInsuranceFee,
}: Props) {
  const [tab,  setTab]  = useState<Tab>('pending')
  const [data, setData] = useState({ pending, rejected })
  const [approveNotice, setApproveNotice] = useState<string | null>(null)
  const [adminFee, setAdminFee] = useState(initialAdminFee)
  const [insuranceFee, setInsuranceFee] = useState(initialInsuranceFee)
  const [error, setError] = useState<string | null>(null)
  const [rejectNotice, setRejectNotice] = useState<string | null>(null)
  const router = useRouter()

  const loadFees = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) return
      if (json.global_admin_fee != null) setAdminFee(Number(json.global_admin_fee))
      if (json.insurance_fee != null) setInsuranceFee(Number(json.insurance_fee))
    } catch {
      // keep existing values
    }
  }, [])

  useEffect(() => {
    setData({ pending, rejected })
  }, [pending, rejected])

  useEffect(() => {
    setAdminFee(initialAdminFee)
    setInsuranceFee(initialInsuranceFee)
  }, [initialAdminFee, initialInsuranceFee])

  useEffect(() => {
    loadFees()
    const onFocus = () => { loadFees() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadFees])

  const lists: Record<Tab, Claim[]> = data

  const handleAction = async (
    claimId: string,
    action:  'approve' | 'reject',
    extra?:  object
  ) => {
    setError(null)
    setRejectNotice(null)
    setApproveNotice(null)
    try {
      const res = await fetch(`/api/claims/${claimId}/${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(extra ?? {}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Action failed.')

      const rejectExtra = extra as { reason?: string } | undefined

      // Move the claim to the correct tab
      setData((prev) => {
        const claim = prev.pending.find((c) => c.id === claimId)
        if (!claim) return prev
        const updated: Claim = {
          ...claim,
          status: action === 'approve' ? 'approved' : 'rejected',
          ...(action === 'reject' && rejectExtra?.reason
            ? { rejection_reason: rejectExtra.reason }
            : {}),
          ...(action === 'reject' && json.notifications
            ? { rejection_notifications: json.notifications as RejectionNotifications }
            : {}),
        }
        return {
          pending:  prev.pending.filter((c) => c.id !== claimId),
          rejected: action === 'reject' ? [updated, ...prev.rejected] : prev.rejected,
        }
      })

      if (action === 'approve') {
        setApproveNotice('Claim approved — workers added to the wages register.')
      }

      if (action === 'reject' && json.notifications) {
        const n = json.notifications as RejectionNotifications
        const parts: string[] = []
        if (n.emailSent && n.emailTo) parts.push(`email sent to ${n.emailTo}`)
        if (n.smsSent) parts.push('SMS sent')
        if (parts.length) {
          setRejectNotice(`Claim rejected — ${parts.join(', ')}.`)
        } else if (n.noEmailOnFile && n.noPhoneOnFile) {
          setRejectNotice('Claim rejected — foreman has no email or phone on file; no notification sent.')
        } else if (n.emailError) {
          setRejectNotice(`Claim rejected — email failed: ${n.emailError}`)
        } else {
          setRejectNotice('Claim rejected — notification could not be sent. Check foreman contact details.')
        }
        setTab('rejected')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending',  label: `Pending (${data.pending.length})`  },
    { key: 'rejected', label: `Rejected (${data.rejected.length})` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex bg-gray-100 rounded-xl p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {approveNotice && (
        <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>{approveNotice}</p>
            <a href="/admin/claims" className="text-xs text-green-800 underline mt-1 inline-block">
              View wages register →
            </a>
          </div>
        </div>
      )}

      {rejectNotice && (
        <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{rejectNotice}</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          loadFees()
          router.refresh()
        }}
        className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-colors"
      >
        Refresh list
      </button>

      <p className="text-xs text-slate-500 text-center -mt-2">
        Fees applied to subcontractors: admin £{adminFee.toFixed(2)} · insurance £{insuranceFee.toFixed(2)} — not charged to management or apprentices
      </p>

      {lists[tab].length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {tab} claims</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists[tab].map((claim, index) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              adminFee={adminFee}
              insuranceFee={insuranceFee}
              onAction={tab === 'pending' ? handleAction : undefined}
              defaultExpanded={tab === 'pending' && lists[tab].length === 1 && index === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

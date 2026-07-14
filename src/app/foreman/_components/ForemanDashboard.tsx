'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, MapPin, Grid3x3, FileUp, ClipboardList,
  Clock, AlertCircle, CheckCircle2, Loader2, Lock, ChevronRight, RotateCcw,
} from 'lucide-react'
import ForemanClaimHistory from './ForemanClaimHistory'
import type { ForemanClaimHistoryItem } from '@/lib/claims/load-foreman-claim-history'
import { formatCountdown } from '@/lib/fortnight'

// ── Types ──────────────────────────────────────────────────────────────────────

type Site = {
  id:        string
  name:      string
  address:   string | null
  is_active: boolean
}

type Period = {
  label:         string
  payLabel:       string
  isLocked:      boolean
  isGracePeriod?: boolean
  lockTime:       string
  start:         string
  end:           string
}

interface Props {
  sites:             Site[]
  currentClaim:      { status: string; claimId: string } | null
  pastClaims:        ForemanClaimHistoryItem[]
  variationCountMap: Record<string, number>
  period:            Period
}

// ── Countdown banner ───────────────────────────────────────────────────────────

function CountdownBanner({ period }: { period: Period }) {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const tick = () => {
      const ms = new Date(period.lockTime).getTime() - Date.now()
      setCountdown(formatCountdown(ms))
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [period.lockTime])

  const isLocked = period.isLocked

  return (
    <div className={`rounded-2xl p-4 flex items-center gap-3 ${
      isLocked
        ? 'bg-red-50 border border-red-200'
        : 'bg-orange-50 border border-orange-200'
    }`}>
      {isLocked
        ? <Lock className="w-5 h-5 text-red-500 shrink-0" />
        : <Clock className="w-5 h-5 text-orange-500 shrink-0" />
      }
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${isLocked ? 'text-red-700' : period.isGracePeriod ? 'text-amber-700' : 'text-orange-700'}`}>
          {isLocked ? 'Claim window locked' : period.isGracePeriod ? 'Grace period — late submissions' : 'Claim window open'}
        </p>
        <p className={`text-xs ${isLocked ? 'text-red-500' : period.isGracePeriod ? 'text-amber-600' : 'text-orange-500'}`}>
          Work window: {period.label}
          {!isLocked && countdown && ` · ${countdown}`}
          {isLocked && ' · Submissions closed until next fortnight'}
          {period.isGracePeriod && !isLocked && ' · Still for this fortnight, not the next'}
        </p>
        <p className={`text-xs mt-0.5 ${isLocked ? 'text-red-400' : 'text-orange-400'}`}>
          Pay date: {period.payLabel}
        </p>
      </div>
    </div>
  )
}

// ── Claim status badge ─────────────────────────────────────────────────────────

function ClaimBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:  {
      label: 'Awaiting Approval',
      cls:   'bg-amber-100 text-amber-700',
      icon:  <Loader2 className="w-3 h-3 animate-spin" />,
    },
    approved: {
      label: 'Claim Approved',
      cls:   'bg-green-100 text-green-700',
      icon:  <CheckCircle2 className="w-3 h-3" />,
    },
    rejected: {
      label: 'Claim Rejected',
      cls:   'bg-red-100 text-red-700',
      icon:  <AlertCircle className="w-3 h-3" />,
    },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {icon}{label}
    </span>
  )
}

// ── Site card ─────────────────────────────────────────────────────────────────

function SiteCard({ site, variationCount }: { site: Site; variationCount: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{site.name}</h3>
            {site.address && (
              <div className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{site.address}</span>
              </div>
            )}
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 bg-green-100 text-green-700">
            Active
          </span>
        </div>
        {variationCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {variationCount} daywork sheet{variationCount > 1 ? 's' : ''} pending admin approval
          </div>
        )}
      </div>
      <div className="border-t border-gray-100 divide-y divide-gray-50">
        <Link href={`/foreman/sites/${site.id}/grid`}
          className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
              <Grid3x3 className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Site Price Grid</p>
              <p className="text-xs text-slate-400">View plots &amp; track lift progress</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </Link>
        <Link href={`/foreman/sites/${site.id}/variation`}
          className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
              <FileUp className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Submit Variation</p>
              <p className="text-xs text-slate-400">Extra works &amp; daywork with photos</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </Link>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ForemanDashboard({
  sites, currentClaim, pastClaims, variationCountMap, period,
}: Props) {
  const router        = useRouter()
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawErr, setWithdrawErr] = useState<string | null>(null)

  const activeSites   = sites.filter((s) => s.is_active)
  const inactiveSites = sites.filter((s) => !s.is_active)

  const hasClaim    = !!currentClaim
  const isPending   = currentClaim?.status === 'pending'
  const isRejected  = currentClaim?.status === 'rejected'

  const handleWithdraw = async () => {
    if (!currentClaim?.claimId) return
    setWithdrawing(true)
    setWithdrawErr(null)
    const res  = await fetch(`/api/claims/${currentClaim.claimId}/withdraw`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { setWithdrawErr(json.error ?? 'Failed to withdraw.'); setWithdrawing(false); return }
    const url = json.cellsParam
      ? `/foreman/claim?cells=${encodeURIComponent(json.cellsParam)}`
      : '/foreman/claim'
    router.push(url)
  }

  return (
    <div className="space-y-4">

      {/* Fortnight countdown */}
      <CountdownBanner period={period} />

      {/* ── Single Fortnightly Claim Button ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Fortnightly Claim</p>
          <p className="text-xs text-slate-400 mt-0.5">One combined claim across all your sites</p>
        </div>

        {hasClaim ? (
          <Link
            href={`/foreman/claim/${currentClaim!.claimId}`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors border-b border-gray-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <ClipboardList className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">View claim</p>
                <p className="text-xs text-slate-400">Workers, pool breakdown &amp; status</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </Link>
        ) : null}

        {hasClaim && isPending ? (
          <div className="divide-y divide-gray-50">
            <div className="flex items-center gap-3 px-5 py-3.5 opacity-60">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Claim Submitted</p>
                <p className="text-xs text-slate-400">Awaiting admin approval</p>
              </div>
              <ClaimBadge status="pending" />
            </div>
            {!period.isLocked && (
              <button disabled={withdrawing} onClick={handleWithdraw}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-50 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    {withdrawing
                      ? <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                      : <RotateCcw className="w-4 h-4 text-amber-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-700">Withdraw &amp; Edit</p>
                    <p className="text-xs text-amber-500">Pull back claim to make changes</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-300" />
              </button>
            )}
            {withdrawErr && <p className="px-5 py-2 text-xs text-red-500">{withdrawErr}</p>}
          </div>
        ) : hasClaim && currentClaim?.status === 'approved' ? (
          <div className="flex items-center gap-3 px-5 py-3.5">
            <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Claim Approved</p>
              <p className="text-xs text-slate-400">Payments processed for this period</p>
            </div>
            <ClaimBadge status="approved" />
          </div>
        ) : hasClaim && isRejected ? (
          <Link href="/foreman/claim"
            className="flex items-center justify-between px-5 py-3.5 hover:bg-blue-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-700">Resubmit Claim</p>
                <p className="text-xs text-blue-400">Claim rejected — tap to resubmit</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-300" />
          </Link>
        ) : period.isLocked ? (
          <div className="flex items-center gap-3 px-5 py-3.5 opacity-40">
            <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Claim Window Closed</p>
              <p className="text-xs text-slate-400">Opens next fortnight</p>
            </div>
          </div>
        ) : (
          <Link href="/foreman/claim"
            className="flex items-center justify-between px-5 py-3.5 hover:bg-blue-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  {isRejected ? 'Resubmit Claim' : 'Build Fortnightly Claim'}
                </p>
                <p className="text-xs text-blue-400">
                  {isRejected ? 'Claim rejected — tap to resubmit' : 'Select lifts from all your sites'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-300" />
          </Link>
        )}
      </div>

      <ForemanClaimHistory claims={pastClaims} />

      {/* No sites */}
      {sites.length === 0 && (
        <div className="flex flex-col items-center text-center py-16 text-slate-400 space-y-3">
          <Building2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">No sites assigned yet.<br />Your admin will assign you to a site shortly.</p>
        </div>
      )}

      {/* Active sites */}
      {activeSites.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-1">
            My Sites ({activeSites.length})
          </p>
          {activeSites.map((site) => (
            <SiteCard key={site.id} site={site} variationCount={variationCountMap[site.id] ?? 0} />
          ))}
        </section>
      )}

      {/* Inactive sites */}
      {inactiveSites.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Inactive Sites</p>
          {inactiveSites.map((site) => (
            <div key={site.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 opacity-50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-700">{site.name}</h3>
                  {site.address && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />{site.address}
                    </p>
                  )}
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                  Inactive
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

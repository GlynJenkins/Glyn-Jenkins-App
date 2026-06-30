'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Lock, GraduationCap, Palmtree,
  Zap, Loader2, ChevronDown, ChevronUp, Building2, Plus, X,
} from 'lucide-react'
import PortalHeader from '@/components/PortalHeader'

// ── Types ─────────────────────────────────────────────────────────────────────

type SelectedLift   = { id: string; plotNumber: string; stageName: string; contractValue: number; fullValue: number; pct: number; siteId: string }
type VariationLine  = { id: string; workerName: string; amount: number }
type VariationGroup = { groupKey: string; description: string; isFixedPay?: boolean; lines: VariationLine[]; total: number }
type Worker         = { id: string; first_name: string; surname: string; role: string }
type Period         = { label: string; payLabel: string; isLocked: boolean; isGracePeriod?: boolean; lockTime: string; start: string; end: string }

interface Props {
  foreman:          { id: string; name: string }
  sites:            { id: string; name: string }[]          // all assigned active sites
  siteLifts:        Record<string, SelectedLift[]>          // siteId → selected lifts
  variationGroups:  VariationGroup[]
  workers:          Worker[]
  holidayRemaining: Record<string, number>
  holidayDayRate:   number
  collegeDayRate:   number
  period:           Period
  initialGang?:     string[]
  initialDays?:     string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function useCountdown(lockTimeIso: string) {
  const calc = () => {
    const ms = Math.max(0, new Date(lockTimeIso).getTime() - Date.now())
    const days  = Math.floor(ms / 86_400_000)
    const hours = Math.floor((ms % 86_400_000) / 3_600_000)
    const mins  = Math.floor((ms % 3_600_000) / 60_000)
    if (ms === 0)  return 'Locked'
    if (days > 0)  return `${days}d ${hours}h remaining`
    if (hours > 0) return `${hours}h ${mins}m remaining`
    return `${mins}m remaining`
  }
  const [label, setLabel] = useState(calc)
  useEffect(() => { const id = setInterval(() => setLabel(calc()), 60_000); return () => clearInterval(id) })
  return label
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MultiSiteClaimBuilder({
  foreman, sites, siteLifts, variationGroups,
  workers, holidayRemaining, holidayDayRate, collegeDayRate, period,
  initialGang = [],
  initialDays = '',
}: Props) {
  const router    = useRouter()
  const countdown = useCountdown(period.lockTime)

  // All lifts across all sites (flat)
  const allLifts = Object.values(siteLifts).flat()

  // ── Variations ────────────────────────────────────────────────────────
  const [selectedGroups,  setSelectedGroups]  = useState<Set<string>>(
    new Set(variationGroups.map((g) => g.groupKey))
  )
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set())

  const variationTotal = variationGroups
    .filter((g) => selectedGroups.has(g.groupKey))
    .reduce((sum, g) => sum + g.total, 0)

  // ── Gang selection ────────────────────────────────────────────────────
  const [gangSelected,  setGangSelected]  = useState<Set<string>>(new Set(initialGang))
  const [gangConfirmed, setGangConfirmed] = useState(initialGang.length > 0)
  const [gangSearch,    setGangSearch]    = useState('')
  const [gangRoleTab,   setGangRoleTab]   = useState<'all' | 'bricklayer' | 'labourer' | 'apprentice'>('all')
  // Foremen shown under bricklayer tab
  const filteredWorkers = workers.filter((w) => {
    const effectiveRole = w.role === 'foreman' ? 'bricklayer' : w.role
    const matchRole     = gangRoleTab === 'all' || effectiveRole === gangRoleTab
    const matchSearch   = gangSearch.trim() === '' ||
      `${w.first_name} ${w.surname}`.toLowerCase().includes(gangSearch.toLowerCase())
    return matchRole && matchSearch
  })
  const toggleGang = (id: string) =>
    setGangSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const gangWorkers        = workers.filter((w) => gangSelected.has(w.id))
  const apprenticeWorkers  = gangWorkers.filter((w) => w.role === 'apprentice')

  // ── Apprentice days ───────────────────────────────────────────────────
  const [apprenticeDays, setApprenticeDays] = useState<
    Record<string, { collegeDays: number; holidayDays: number }>
  >(() => {
    const restored: Record<string, { collegeDays: number; holidayDays: number }> = {}
    if (initialDays) {
      for (const part of initialDays.split(',')) {
        const [id, c, h] = part.split(':')
        if (id) restored[id] = { collegeDays: parseInt(c ?? '0') || 0, holidayDays: parseInt(h ?? '0') || 0 }
      }
    }
    return Object.fromEntries(
      workers.filter((w) => w.role === 'apprentice')
        .map((w) => [w.id, restored[w.id] ?? { collegeDays: 0, holidayDays: 0 }])
    )
  })

  const apprenticeTotal = apprenticeWorkers.reduce((sum, w) => {
    const e = apprenticeDays[w.id]
    return sum + (e ? e.collegeDays * collegeDayRate + e.holidayDays * holidayDayRate : 0)
  }, 0)

  // ── Allocations ───────────────────────────────────────────────────────
  const [allocations, setAllocations] = useState<Record<string, string>>(
    () => Object.fromEntries(workers.map((w) => [w.id, '']))
  )

  const liftsTotal    = allLifts.reduce((sum, l) => sum + l.contractValue, 0)
  const allocatedTotal = gangWorkers.reduce((sum, w) => sum + (parseFloat(allocations[w.id] ?? '0') || 0), 0)
  const poolTotal     = liftsTotal + variationTotal + apprenticeTotal
  const remaining     = poolTotal - allocatedTotal
  const overAllocated = allocatedTotal > poolTotal + 0.009

  // ── URL encoding for grid navigation ─────────────────────────────────
  const cellsParam = allLifts
    .map((l) => `${l.id}:${Math.round(l.contractValue * 100)}`)
    .join(',')
  const gangParam = Array.from(gangSelected).join(',')
  const daysParam = Object.entries(apprenticeDays)
    .filter(([, e]) => e.collegeDays > 0 || e.holidayDays > 0)
    .map(([id, e]) => `${id}:${e.collegeDays}:${e.holidayDays}`)
    .join(',')

  const goToGrid = (siteId: string) => {
    const url = `/foreman/sites/${siteId}/grid?cells=${cellsParam}${gangParam ? `&gang=${gangParam}` : ''}${daysParam ? `&days=${daysParam}` : ''}`
    router.push(url)
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (period.isLocked)        { setError('Submission window is locked.'); return }
    if (poolTotal === 0)        { setError('No lifts selected — go to a site grid and select lifts.'); return }
    if (allocatedTotal === 0)   { setError('No worker allocations entered.'); return }
    if (overAllocated)          { setError('Allocations exceed the pool total.'); return }
    if (remaining > 0.009)      { setError(`£${remaining.toFixed(2)} is still unallocated — every penny must be assigned before submitting.`); return }

    // Build site name lookup
    const siteNameMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))

    const poolItems = [
      ...allLifts.map((l) => ({
        type: 'grid_cell', id: l.id,
        label:    `Plot ${l.plotNumber} — ${l.stageName}`,
        siteName: siteNameMap[l.siteId] ?? 'Unknown Site',
        amount:   l.contractValue,
        fullValue: l.fullValue,
      })),
      ...variationGroups.filter((g) => selectedGroups.has(g.groupKey)).map((g) => ({
        type: 'variation', id: g.groupKey,
        label: g.isFixedPay ? g.description : `Valuation — ${g.description}`,
        amount: g.total,
      })),
      ...workers.filter((w) => w.role === 'apprentice').flatMap((w) => {
        const e = apprenticeDays[w.id]
        const items = []
        if (e?.collegeDays > 0) items.push({ type: 'apprentice_college', id: w.id, label: `${w.first_name} ${w.surname} — College (${e.collegeDays}d)`, amount: e.collegeDays * collegeDayRate })
        if (e?.holidayDays > 0) items.push({ type: 'apprentice_holiday', id: w.id, label: `${w.first_name} ${w.surname} — Holiday (${e.holidayDays}d)`, amount: e.holidayDays * holidayDayRate })
        return items
      }),
    ]

    const allocationList = gangWorkers
      .map((w) => ({ workerId: w.id, grossAmount: parseFloat(allocations[w.id] ?? '0') || 0 }))
      .filter((a) => a.grossAmount > 0)

    const apprenticeDaysList = workers
      .filter((w) => w.role === 'apprentice')
      .map((w) => ({ workerId: w.id, ...apprenticeDays[w.id] }))

    const variationIds = variationGroups
      .filter((g) => selectedGroups.has(g.groupKey))
      .flatMap((g) => g.lines.map((l) => l.id))

    setSubmitting(true)
    try {
      const res  = await fetch('/api/claims', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          siteId:         null,  // multi-site — no single site
          foremanId:      foreman.id,
          poolTotal,
          poolItems,
          allocations:    allocationList,
          apprenticeDays: apprenticeDaysList,
          variationIds,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Submission failed.'); setSubmitting(false); return }
      setSuccess(true)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }, [
    period.isLocked, poolTotal, allocatedTotal, overAllocated, remaining,
    allLifts, variationGroups, selectedGroups, workers, apprenticeDays,
    gangWorkers, allocations, foreman.id, collegeDayRate, holidayDayRate, sites,
  ])

  // ── Success screen ────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Claim Submitted</h1>
        <p className="text-slate-500 text-sm max-w-sm">
          Your fortnightly claim has been sent to admin for approval.
        </p>
        <button
          onClick={() => router.push('/foreman')}
          className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <PortalHeader>
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => router.push('/foreman')}
            className="flex items-center gap-1.5 text-orange-400 text-xs font-semibold tracking-widest uppercase mb-2"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold text-white">Fortnightly Claim</h1>
          <p className="text-slate-400 text-sm mt-0.5">{foreman.name}</p>
          <div className={`mt-3 space-y-1 text-xs font-medium ${period.isLocked ? 'text-red-400' : 'text-orange-400'}`}>
            <div className="flex items-center gap-2">
              {period.isLocked ? <Lock className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Work window: {period.label} · {countdown}
            </div>
            <p>Pay date: {period.payLabel}</p>
          </div>
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-32 max-w-lg mx-auto space-y-4">

        {/* ── Sites & Lifts ────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h2 className="font-bold text-slate-900 text-base">Site Lifts</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select lifts from any of your assigned sites</p>
          </div>

          <div className="divide-y divide-gray-50">
            {sites.map((site) => {
              const lifts     = siteLifts[site.id] ?? []
              const siteTotal = lifts.reduce((sum, l) => sum + l.contractValue, 0)
              return (
                <div key={site.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold text-slate-800">{site.name}</span>
                      {lifts.length > 0 && (
                        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          {lifts.length} lift{lifts.length > 1 ? 's' : ''} · {fmt(siteTotal)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => goToGrid(site.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg"
                    >
                      <Plus className="w-3 h-3" />
                      {lifts.length > 0 ? 'Change' : 'Add Lifts'}
                    </button>
                  </div>

                  {lifts.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {lifts.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                          <span>Plot {l.plotNumber} — {l.stageName} {l.pct < 100 && <span className="text-orange-500">({l.pct}%)</span>}</span>
                          <span className="font-semibold text-slate-800">{fmt(l.contractValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {allLifts.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center bg-slate-50">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Lifts</span>
              <span className="text-sm font-bold text-slate-800">{fmt(liftsTotal)}</span>
            </div>
          )}
        </section>

        {/* ── Variations ──────────────────────────────────────────────── */}
        {variationGroups.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" /> Approved Variations
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {variationGroups.map((g) => (
                <div key={g.groupKey}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(g.groupKey)}
                      onChange={() => setSelectedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(g.groupKey)) next.delete(g.groupKey)
                        else next.add(g.groupKey)
                        return next
                      })}
                      className="accent-orange-500 w-4 h-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {g.isFixedPay ? g.description : `Valuation — ${g.description}`}
                      </p>
                      {!g.isFixedPay && (
                        <p className="text-xs text-slate-400">{fmt(g.total)} · {g.lines.length} worker{g.lines.length === 1 ? '' : 's'}</p>
                      )}
                      {g.isFixedPay && (
                        <p className="text-xs text-slate-400">{fmt(g.total)}</p>
                      )}
                    </div>
                    {g.isFixedPay && (
                      <span className="font-bold text-slate-800 text-sm shrink-0">{fmt(g.total)}</span>
                    )}
                    {!g.isFixedPay && (
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(g.groupKey)) next.delete(g.groupKey)
                        else next.add(g.groupKey)
                        return next
                      })}
                      className="text-slate-400 p-1"
                    >
                      {expandedGroups.has(g.groupKey) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    )}
                  </div>
                  {!g.isFixedPay && expandedGroups.has(g.groupKey) && (
                    <div className="px-5 pb-3 space-y-1">
                      {g.lines.map((l) => (
                        <div key={l.id} className="flex justify-between text-xs text-slate-500 bg-gray-50 rounded-lg px-3 py-1.5">
                          <span>{l.workerName}</span>
                          <span>{fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Gang selection ───────────────────────────────────────────── */}
        {!gangConfirmed ? (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-900 text-base">Select Your Gang</h2>
              <p className="text-xs text-slate-400 mt-0.5">Choose the workers on this claim</p>
            </div>

            <div className="px-4 pb-2">
              <input
                type="search"
                value={gangSearch}
                onChange={(e) => setGangSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"
              />
            </div>

            <div className="flex gap-1 px-4 pb-3">
              {(['all', 'bricklayer', 'labourer', 'apprentice'] as const).map((role) => (
                <button key={role} type="button" onClick={() => setGangRoleTab(role)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    gangRoleTab === role ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-500 hover:bg-gray-200'
                  }`}>
                  {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1) + 's'}
                </button>
              ))}
            </div>

            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {filteredWorkers.length === 0
                ? <p className="text-center text-xs text-slate-400 py-6">No workers match</p>
                : filteredWorkers.map((w) => (
                  <button key={w.id} type="button" onClick={() => toggleGang(w.id)}
                    className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${gangSelected.has(w.id) ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${gangSelected.has(w.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                      {gangSelected.has(w.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{w.surname}, {w.first_name}</p>
                      <p className="text-xs text-slate-400 capitalize">{w.role}</p>
                    </div>
                  </button>
                ))
              }
            </div>

            {gangSelected.size > 0 && (
              <div className="px-5 py-4 border-t border-gray-100">
                <div className="flex flex-wrap gap-2 mb-3">
                  {gangWorkers.map((w) => (
                    <span key={w.id} className="flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-medium px-2.5 py-1 rounded-full">
                      {w.first_name} {w.surname}
                      <button type="button" onClick={() => toggleGang(w.id)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setGangConfirmed(true)}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm"
                >
                  Confirm Gang ({gangSelected.size} worker{gangSelected.size > 1 ? 's' : ''})
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-900 text-base">Gang</h2>
              <button type="button" onClick={() => setGangConfirmed(false)} className="text-xs text-blue-500 underline">
                Change
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {gangWorkers.map((w) => (
                <span key={w.id} className="bg-orange-100 text-orange-700 text-xs font-medium px-2.5 py-1 rounded-full capitalize">
                  {w.first_name} {w.surname} · {w.role}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Apprentice allowances ────────────────────────────────────── */}
        {gangConfirmed && apprenticeWorkers.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-900 text-base">Apprentice Allowances</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {apprenticeWorkers.map((w) => {
                const entry   = apprenticeDays[w.id] ?? { collegeDays: 0, holidayDays: 0 }
                const holLeft = holidayRemaining[w.id] ?? 0
                const wTotal  = entry.collegeDays * collegeDayRate + entry.holidayDays * holidayDayRate
                return (
                  <div key={w.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{w.first_name} {w.surname}</p>
                        <p className={`text-xs mt-0.5 ${holLeft === 0 ? 'text-red-500' : holLeft <= 10 ? 'text-amber-500' : 'text-slate-400'}`}>
                          {holLeft} holiday day{holLeft !== 1 ? 's' : ''} remaining
                        </p>
                      </div>
                      {wTotal > 0 && <span className="text-sm font-bold text-slate-800">{fmt(wTotal)}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 mb-1.5">
                          <GraduationCap className="w-3.5 h-3.5" /> College Days
                        </label>
                        <input type="number" min={0} value={entry.collegeDays || ''} placeholder="0"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-center outline-none focus:ring-2 focus:ring-orange-400"
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setApprenticeDays((p) => ({ ...p, [w.id]: { ...entry, collegeDays: val } }))
                          }}
                        />
                        <span className="text-xs text-slate-400 mt-1 block text-center">× £{collegeDayRate} = {fmt(entry.collegeDays * collegeDayRate)}</span>
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 mb-1.5">
                          <Palmtree className="w-3.5 h-3.5" /> Holiday Days
                        </label>
                        <input type="number" min={0} max={holLeft} value={entry.holidayDays || ''} placeholder="0"
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-center outline-none focus:ring-2 focus:ring-orange-400"
                          onChange={(e) => {
                            const val = Math.min(parseInt(e.target.value) || 0, holLeft)
                            setApprenticeDays((p) => ({ ...p, [w.id]: { ...entry, holidayDays: val } }))
                          }}
                        />
                        <span className="text-xs text-slate-400 mt-1 block text-center">× £{holidayDayRate} = {fmt(entry.holidayDays * holidayDayRate)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Pay allocation ───────────────────────────────────────────── */}
        {gangConfirmed && gangWorkers.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Pay Allocation</h2>
                <p className="text-xs text-slate-400 mt-0.5">Allocate the full pool across your gang</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Pool</p>
                <p className="text-base font-bold text-slate-900">{fmt(poolTotal)}</p>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {gangWorkers.map((w) => {
                const val = allocations[w.id] ?? ''
                return (
                  <div key={w.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{w.first_name} {w.surname}</p>
                      <p className="text-xs text-slate-400 capitalize">{w.role}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-400">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={val}
                        placeholder="0.00"
                        className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm text-right outline-none focus:ring-2 focus:ring-orange-400"
                        onChange={(e) => setAllocations((p) => ({ ...p, [w.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={`px-5 py-4 border-t ${overAllocated ? 'border-red-200 bg-red-50' : remaining < 0.01 ? 'border-green-200 bg-green-50' : 'border-orange-100 bg-orange-50'}`}>
              <div className="flex justify-between items-center">
                <span className={`text-sm font-semibold ${overAllocated ? 'text-red-700' : remaining < 0.01 ? 'text-green-700' : 'text-orange-700'}`}>
                  {overAllocated ? 'Over-allocated' : remaining < 0.01 ? 'Fully allocated' : 'Remaining'}
                </span>
                <span className={`text-base font-bold ${overAllocated ? 'text-red-700' : remaining < 0.01 ? 'text-green-700' : 'text-orange-700'}`}>
                  {fmt(Math.abs(remaining))}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 safe-bottom-bar">
        <div className="max-w-lg mx-auto space-y-2">
          {poolTotal > 0 && (
            <div className="flex justify-between text-xs text-slate-500 px-1">
              <span>Pool: {fmt(poolTotal)}</span>
              <span>Allocated: {fmt(allocatedTotal)}</span>
              {remaining > 0.009 && <span className="text-orange-500">Unallocated: {fmt(remaining)}</span>}
            </div>
          )}
          {period.isLocked ? (
            <div className="w-full flex items-center justify-center gap-2 bg-gray-200 text-gray-500 font-semibold py-4 rounded-xl text-base">
              <Lock className="w-5 h-5" /> Submission Window Closed
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !gangConfirmed || poolTotal === 0}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700
                         active:bg-orange-800 disabled:bg-orange-300 text-white font-semibold py-4 rounded-xl
                         transition-colors text-base"
            >
              {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</> : 'Submit Claim'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

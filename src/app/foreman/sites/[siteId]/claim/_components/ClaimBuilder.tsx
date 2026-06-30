'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Lock, GraduationCap, Palmtree,
  Zap, Loader2, ChevronDown, ChevronUp, ArrowLeft,
} from 'lucide-react'
import PortalHeader from '@/components/PortalHeader'

// ── Types ─────────────────────────────────────────────────────────────────────

type SelectedLift    = { id: string; plotNumber: string; stageName: string; contractValue: number; fullValue: number; pct: number }
type VariationLine   = { id: string; workerName: string; amount: number }
type VariationGroup  = { groupKey: string; description: string; isFixedPay?: boolean; lines: VariationLine[]; total: number }
type Worker          = { id: string; first_name: string; surname: string; role: string }
type Period          = { label: string; payLabel: string; isLocked: boolean; isGracePeriod?: boolean; lockTime: string; start: string; end: string }

interface Props {
  site:             { id: string; name: string }
  siteId:           string
  foreman:          { id: string; name: string }
  selectedLifts:    SelectedLift[]
  variationGroups:  VariationGroup[]
  workers:          Worker[]
  holidayRemaining: Record<string, number>
  holidayDayRate:   number
  collegeDayRate:   number
  period:           Period
  initialGang?:     string[]  // pre-selected worker IDs restored from URL
  initialDays?:     string    // "workerId:collegeDays:holidayDays,…" restored from URL
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

export default function ClaimBuilder({
  site, siteId, foreman, selectedLifts, variationGroups,
  workers, holidayRemaining, holidayDayRate, collegeDayRate, period,
  initialGang = [],
  initialDays = '',
}: Props) {
  const router    = useRouter()
  const countdown = useCountdown(period.lockTime)

  // ── Lift summary expand/collapse ──────────────────────────────────────
  const [liftsExpanded, setLiftsExpanded] = useState(false)
  const liftsTotal = selectedLifts.reduce((sum, l) => sum + l.contractValue, 0)

  // ── Variations (selected by group key) ───────────────────────────────
  const [selectedGroups,   setSelectedGroups]   = useState<Set<string>>(
    new Set(variationGroups.map((g) => g.groupKey))  // auto-include all
  )
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(new Set())

  const variationTotal = variationGroups
    .filter((g) => selectedGroups.has(g.groupKey))
    .reduce((sum, g) => sum + g.total, 0)

  // ── Gang selection ────────────────────────────────────────────────────
  const [gangSelected,  setGangSelected]  = useState<Set<string>>(new Set(initialGang))
  const [gangConfirmed, setGangConfirmed] = useState(initialGang.length > 0)
  const [gangSearch,    setGangSearch]    = useState('')
  const [gangRoleTab,   setGangRoleTab]   = useState<'all' | 'bricklayer' | 'labourer' | 'apprentice'>('all')
  // Foremen are shown under the Bricklayer tab (same pay rate)

  const toggleGang = (id: string) =>
    setGangSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filteredWorkers = workers.filter((w) => {
    // Foremen appear alongside bricklayers (same pay grade)
    const effectiveRole = w.role === 'foreman' ? 'bricklayer' : w.role
    const matchRole     = gangRoleTab === 'all' || effectiveRole === gangRoleTab
    const matchSearch   = gangSearch.trim() === '' ||
      `${w.first_name} ${w.surname}`.toLowerCase().includes(gangSearch.toLowerCase())
    return matchRole && matchSearch
  })

  const gangWorkers     = workers.filter((w) => gangSelected.has(w.id))
  const apprenticeWorkers = gangWorkers.filter((w) => w.role === 'apprentice')

  // ── Apprentice days ───────────────────────────────────────────────────
  const [apprenticeDays, setApprenticeDays] = useState<
    Record<string, { collegeDays: number; holidayDays: number }>
  >(() => {
    // Parse restored days from URL if present
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

  // ── Worker allocations ────────────────────────────────────────────────
  const [allocations, setAllocations] = useState<Record<string, string>>(
    () => Object.fromEntries(workers.map((w) => [w.id, '']))
  )
  const allocatedTotal = gangWorkers.reduce((sum, w) =>
    sum + (parseFloat(allocations[w.id] ?? '0') || 0), 0)

  const poolTotal     = liftsTotal + variationTotal + apprenticeTotal
  const remaining     = poolTotal - allocatedTotal
  const overAllocated = allocatedTotal > poolTotal

  // ── Submit ────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Encode current lifts + gang + apprentice days into URL params for grid navigation
  const cellsParam = selectedLifts
    .map((l) => `${l.id}:${Math.round(l.contractValue * 100)}`)
    .join(',')
  const gangParam = Array.from(gangSelected).join(',')
  const daysParam = Object.entries(apprenticeDays)
    .filter(([, e]) => e.collegeDays > 0 || e.holidayDays > 0)
    .map(([id, e]) => `${id}:${e.collegeDays}:${e.holidayDays}`)
    .join(',')

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (period.isLocked)        { setError('Submission window is locked.'); return }
    if (poolTotal === 0)        { setError('No lifts selected — go back and select from the price grid.'); return }
    if (allocatedTotal === 0)   { setError('No worker allocations entered.'); return }
    if (overAllocated)          { setError('Allocations exceed the pool total.'); return }
    if (remaining > 0.009)      { setError(`£${remaining.toFixed(2)} is still unallocated — every penny must be assigned before submitting.`); return }

    const poolItems = [
      ...selectedLifts.map((l) => ({
        type: 'grid_cell', id: l.id,
        label: `Plot ${l.plotNumber} — ${l.stageName}`,
        amount: l.contractValue,
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
        if (e?.collegeDays > 0) items.push({
          type: 'college', id: w.id,
          label: `${w.first_name} ${w.surname} — College (${e.collegeDays}d)`,
          amount: e.collegeDays * collegeDayRate,
        })
        if (e?.holidayDays > 0) items.push({
          type: 'holiday', id: w.id,
          label: `${w.first_name} ${w.surname} — Holiday (${e.holidayDays}d)`,
          amount: e.holidayDays * holidayDayRate,
        })
        return items
      }),
    ]

    setSubmitting(true)
    try {
      const res = await fetch('/api/claims', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId:    site.id,
          foremanId: foreman.id,
          poolTotal,
          poolItems,
          allocations: workers.map((w) => ({
            workerId:    w.id,
            grossAmount: parseFloat(allocations[w.id] ?? '0') || 0,
          })),
          apprenticeDays: workers
            .filter((w) => w.role === 'apprentice')
            .map((w) => ({ workerId: w.id, ...apprenticeDays[w.id] })),
          variationIds: variationGroups
            .filter((g) => selectedGroups.has(g.groupKey))
            .flatMap((g) => g.lines.map((l) => l.id)),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Submission failed.')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.')
    } finally {
      setSubmitting(false)
    }
  }, [
    period.isLocked, poolTotal, allocatedTotal, overAllocated,
    selectedLifts, variationGroups, selectedGroups, workers,
    allocations, apprenticeDays, site.id, foreman.id,
    collegeDayRate, holidayDayRate, remaining,
  ])

  // ── Success screen ────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Claim Submitted</h1>
        <p className="text-slate-500 text-sm text-center mb-8">
          Your fortnightly claim for <span className="font-medium">{site.name}</span> has been
          sent to admin for approval.
        </p>
        <button
          onClick={() => router.push('/foreman')}
          className="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold"
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
            onClick={() => router.push(`/foreman/sites/${siteId}/grid?cells=${cellsParam}${gangParam ? `&gang=${gangParam}` : ''}${daysParam ? `&days=${daysParam}` : ''}`)}
            className="flex items-center gap-1.5 text-orange-400 text-xs font-semibold tracking-widest uppercase mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Price Grid
          </button>
          <h1 className="text-xl font-bold text-white">{site.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">Fortnightly Claim</p>
          <div className={`mt-4 px-4 py-3 rounded-xl text-sm space-y-1 ${
            period.isLocked ? 'bg-red-900/50 text-red-300' : 'bg-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center justify-between">
              <span>Work: {period.label}</span>
              <span className="flex items-center gap-1.5 font-medium">
                {period.isLocked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : countdown}
              </span>
            </div>
            <p className="text-xs opacity-90">Pay date: {period.payLabel}</p>
          </div>
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-4">

        {/* ── SELECTED LIFTS SUMMARY ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            className="w-full px-5 py-4 flex items-center justify-between"
            onClick={() => setLiftsExpanded((p) => !p)}
          >
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">
                Selected Lifts
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({selectedLifts.length} cell{selectedLifts.length !== 1 ? 's' : ''})
                </span>
              </p>
              {selectedLifts.length === 0 && (
                <p className="text-xs text-red-500 mt-0.5">No lifts selected — go back to price grid</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-orange-600">{fmt(liftsTotal)}</span>
              {liftsExpanded
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />
              }
            </div>
          </button>

          {liftsExpanded && selectedLifts.length > 0 && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {selectedLifts.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-5 py-2.5">
                  <div>
                    <span className="text-xs text-slate-600">
                      Plot {l.plotNumber} — {l.stageName}
                    </span>
                    {l.pct < 100 && (
                      <span className="ml-2 text-[10px] font-semibold bg-orange-100 text-orange-600 rounded px-1.5 py-0.5">
                        {l.pct}%
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-800">{fmt(l.contractValue)}</span>
                </div>
              ))}
              <div className="px-5 py-3 bg-orange-50 flex justify-between">
                <span className="text-xs font-medium text-orange-700">Lifts subtotal</span>
                <span className="text-sm font-bold text-orange-700">{fmt(liftsTotal)}</span>
              </div>
            </div>
          )}

          <div className="px-5 pb-4">
            <button
              onClick={() => router.push(`/foreman/sites/${siteId}/grid?cells=${cellsParam}${gangParam ? `&gang=${gangParam}` : ''}${daysParam ? `&days=${daysParam}` : ''}`)}
              className="text-xs text-blue-500 underline"
            >
              ← Go back to add / change lifts
            </button>
          </div>
        </section>

        {/* ── APPROVED VARIATIONS ── */}
        {variationGroups.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Approved Valuations
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Auto-included — tap to deselect. Expand to see individual lines.
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {variationGroups.map((g) => {
                const on       = selectedGroups.has(g.groupKey)
                const expanded = expandedGroups.has(g.groupKey)
                return (
                  <div key={g.groupKey} className={on ? '' : 'opacity-40'}>
                    {/* Group header row */}
                    <div className="flex items-center gap-2 px-5 py-3">
                      {/* Toggle include/exclude */}
                      <button
                        onClick={() => {
                          const next = new Set(selectedGroups)
                          if (on) next.delete(g.groupKey)
                          else next.add(g.groupKey)
                          setSelectedGroups(next)
                        }}
                        className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          on ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                        }`}
                      >
                        {on && <span className="text-white text-xs font-bold">✓</span>}
                      </button>

                      {/* Label + total */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {g.isFixedPay ? g.description : `Valuation — ${g.description}`}
                        </p>
                        {!g.isFixedPay && (
                          <p className="text-xs text-slate-400">
                            {g.lines.length} worker{g.lines.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-slate-800 text-sm shrink-0">{fmt(g.total)}</span>

                      {!g.isFixedPay && (
                      <button
                        onClick={() => {
                          const next = new Set(expandedGroups)
                          if (expanded) next.delete(g.groupKey)
                          else next.add(g.groupKey)
                          setExpandedGroups(next)
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        {expanded
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />
                        }
                      </button>
                      )}
                    </div>

                    {!g.isFixedPay && expanded && (
                      <div className="bg-amber-50 border-t border-amber-100 divide-y divide-amber-100">
                        {g.lines.map((line) => (
                          <div key={line.id}
                               className="flex items-center justify-between px-8 py-2">
                            <span className="text-xs text-slate-600">{line.workerName}</span>
                            <span className="text-xs font-semibold text-slate-700">{fmt(line.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {variationTotal > 0 && (
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 flex justify-between">
                <span className="text-xs text-amber-700">Valuations subtotal</span>
                <span className="text-sm font-bold text-amber-700">{fmt(variationTotal)}</span>
              </div>
            )}
          </section>
        )}

        {/* ── APPRENTICE ALLOWANCES ── */}
        {apprenticeWorkers.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-blue-500" />
                Apprentice Allowances
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">College @ £{collegeDayRate}/day · Holiday @ £{holidayDayRate}/day</p>
            </div>
            <div className="divide-y divide-gray-50">
              {apprenticeWorkers.map((w) => {
                const entry   = apprenticeDays[w.id] ?? { collegeDays: 0, holidayDays: 0 }
                const holLeft = holidayRemaining[w.id] ?? 0
                const wTotal  = entry.collegeDays * collegeDayRate + entry.holidayDays * holidayDayRate
                return (
                  <div key={w.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">
                        {w.first_name} {w.surname}
                      </p>
                      {wTotal > 0 && <span className="text-sm font-bold text-blue-600">{fmt(wTotal)}</span>}
                    </div>
                    {/* College */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-blue-600 w-32 shrink-0">
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">College Days</span>
                      </div>
                      <input
                        type="number" min={0} value={entry.collegeDays || ''} placeholder="0"
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0)
                          setApprenticeDays((p) => ({ ...p, [w.id]: { ...entry, collegeDays: val } }))
                        }}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center
                                   outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <span className="text-xs text-slate-400">× £{collegeDayRate} = {fmt(entry.collegeDays * collegeDayRate)}</span>
                    </div>
                    {/* Holiday */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-green-600 w-32 shrink-0">
                        <Palmtree className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Holiday Days</span>
                      </div>
                      <input
                        type="number" min={0} max={holLeft} value={entry.holidayDays || ''} placeholder="0"
                        onChange={(e) => {
                          const val = Math.min(holLeft, Math.max(0, parseInt(e.target.value) || 0))
                          setApprenticeDays((p) => ({ ...p, [w.id]: { ...entry, holidayDays: val } }))
                        }}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center
                                   outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <span className="text-xs text-slate-400">
                        × £{holidayDayRate} = {fmt(entry.holidayDays * holidayDayRate)}
                        <span className={`ml-1 font-medium ${
                          holLeft === 0 ? 'text-red-500' :
                          holLeft <= 10 ? 'text-amber-500' : 'text-slate-300'
                        }`}>
                          ({holLeft === 0 ? 'No days left!' : `${holLeft} left`})
                        </span>
                      </span>
                    </div>
                    {holLeft === 0 && (
                      <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5">
                        ⚠ {w.first_name} has used all 28 holiday days this year.
                      </p>
                    )}
                    {holLeft > 0 && holLeft <= 10 && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                        ⚠ Only {holLeft} holiday {holLeft === 1 ? 'day' : 'days'} remaining for {w.first_name} this year.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── POOL TOTAL ── */}
        <div className="bg-slate-900 rounded-2xl px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Claim Pool</p>
            <p className="text-3xl font-bold text-orange-400 mt-0.5">{fmt(poolTotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">Allocated</p>
            <p className={`text-lg font-bold ${overAllocated ? 'text-red-400' : 'text-white'}`}>
              {fmt(allocatedTotal)}
            </p>
          </div>
        </div>

        {/* ── GANG SELECTION ── */}
        {!gangConfirmed ? (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-slate-900 text-sm">Select Your Gang</h2>
              <p className="text-xs text-slate-500 mt-0.5">Search and tap to add workers on site this fortnight</p>
            </div>

            {/* Selected chips */}
            {gangSelected.size > 0 && (
              <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 border-b border-gray-100">
                {workers.filter((w) => gangSelected.has(w.id)).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleGang(w.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-800
                               text-xs font-medium rounded-full"
                  >
                    {w.first_name} {w.surname}
                    <span className="text-orange-500 font-bold">×</span>
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <input
                type="text"
                placeholder="Search by name…"
                value={gangSearch}
                onChange={(e) => setGangSearch(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                           focus:ring-2 focus:ring-orange-400 bg-gray-50"
              />
            </div>

            {/* Role tabs */}
            <div className="flex gap-1 px-4 pb-3">
              {(['all', 'bricklayer', 'labourer', 'apprentice'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setGangRoleTab(role)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    gangRoleTab === role
                      ? 'bg-slate-900 text-white'
                      : 'bg-gray-100 text-slate-500 hover:bg-gray-200'
                  }`}
                >
                  {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1) + 's'}
                </button>
              ))}
            </div>

            {/* Filtered worker list */}
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {filteredWorkers.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">No workers match your search</p>
              ) : filteredWorkers.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleGang(w.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                    gangSelected.has(w.id) ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    gangSelected.has(w.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                  }`}>
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
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-100">
              <button
                disabled={gangSelected.size === 0}
                onClick={() => setGangConfirmed(true)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-gray-100
                           disabled:text-gray-400 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {gangSelected.size === 0
                  ? 'Select at least one worker'
                  : `Confirm Gang (${gangSelected.size} worker${gangSelected.size > 1 ? 's' : ''})`}
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Gang confirmed — show allocations */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900 text-sm">Allocate to Workers</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Enter gross £ amount per worker</p>
                </div>
                <button
                  onClick={() => setGangConfirmed(false)}
                  className="text-xs text-orange-500 underline"
                >
                  Edit gang
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {gangWorkers.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {w.surname}, {w.first_name}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">{w.role}</p>
                    </div>
                    <div className="relative shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                      <input
                        type="number" min={0} step="0.01"
                        value={allocations[w.id] ?? ''} placeholder="0.00"
                        onChange={(e) => setAllocations((p) => ({ ...p, [w.id]: e.target.value }))}
                        className="w-28 pl-7 pr-2 py-2 border border-gray-200 rounded-xl text-sm text-right
                                   outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`px-5 py-3 border-t flex items-center justify-between ${
                overAllocated ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
              }`}>
                <span className="text-xs text-slate-500">Remaining unallocated</span>
                <span className={`text-sm font-bold ${overAllocated ? 'text-red-600' : 'text-slate-700'}`}>
                  {fmt(remaining)}
                </span>
              </div>
            </section>
          </>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
      </div>

      {/* Fixed submit footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 safe-bottom-bar">
        <div className="max-w-lg mx-auto">
          <button
            disabled={period.isLocked || submitting || poolTotal === 0 || overAllocated || !gangConfirmed}
            onClick={handleSubmit}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200
                       disabled:text-gray-400 text-white font-bold text-base rounded-2xl
                       transition-colors flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
              : period.isLocked
              ? <><Lock className="w-5 h-5" /> Submission Locked</>
              : 'Submit Claim for Approval'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

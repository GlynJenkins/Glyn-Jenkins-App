'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, ClipboardList, X, Lock } from 'lucide-react'

type Stage = { id: string; name: string }
type Cell  = {
  id:              string
  plotNumber:      string
  stageId:         string
  contractValue:   number
  currentBalance:  number | null
  cellColor:       string
  overrideNote:    string | null
  totalClaimedPct: number   // 0–100 accumulated across all claims
}

// claimAmount = the £ value being claimed this time (may be fraction of contractValue)
type Selection = { fullValue: number; claimAmount: number }

const ADMIN_COLOR: Record<string, string> = {
  white:  'bg-white text-slate-700',
  orange: 'bg-orange-300 text-slate-800',
  blue:   'bg-blue-400 text-white',
  green:  'bg-green-500 text-white',
}

// Cell colour driven by claim status (overrides admin colour in foreman view)
function claimColor(totalClaimedPct: number, cellColor: string): string {
  if (totalClaimedPct >= 100) return 'bg-green-500 text-white'   // fully claimed
  if (totalClaimedPct > 0)    return 'bg-orange-300 text-slate-800' // partially claimed
  return ADMIN_COLOR[cellColor] ?? ADMIN_COLOR.white
}

function isTotalStage(name: string): boolean {
  const n = name.toLowerCase().trim()
  return n.includes('total') || n.includes('subtotal') || n === 'sum'
}

function fmtShort(v: number): string {
  if (v === 0) return '—'
  return '£' + v.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}
function fmtFull(v: number): string {
  return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  siteId:       string
  initialCells:    string  // "cellId:penceAmount,…" — this site's selected cells
  otherSitesCells: string  // "cellId:penceAmount,…" — other sites' cells, passed through untouched
  initialGang:     string  // "workerId,workerId,…" — preserved across navigation
  initialDays:     string  // "workerId:college:holiday,…" — apprentice days preserved
  stages:       Stage[]
  plotNumbers:  string[]
  cells:        Cell[]
}

// ── Percentage picker ─────────────────────────────────────────────────────────

const PCTS = [25, 50, 75, 100] as const

function PctPicker({
  cell,
  currentClaimAmount,
  onPick,
  onRemove,
  onClose,
}: {
  cell:               Cell
  currentClaimAmount: number | null
  onPick:             (amount: number) => void
  onRemove:           () => void
  onClose:            () => void
}) {
  const remainingPct   = Math.max(0, 100 - cell.totalClaimedPct)
  const remainingValue = Math.round(cell.contractValue * remainingPct / 100 * 100) / 100

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-5 safe-bottom-bar pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <p className="text-xs text-slate-500 mb-0.5">Plot {cell.plotNumber}</p>
        <p className="text-base font-bold text-slate-900">
          {fmtShort(cell.contractValue)} full value
        </p>
        {cell.totalClaimedPct > 0 && (
          <p className="text-xs text-orange-600 mt-0.5">
            {cell.totalClaimedPct}% already claimed — {fmtShort(remainingValue)} remaining
          </p>
        )}

        <p className="text-xs text-slate-400 mt-3 mb-3">
          How much of the remaining {fmtShort(remainingValue)} to claim now?
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PCTS.map((pct) => {
            const amount = Math.round(remainingValue * pct / 100 * 100) / 100
            const isOn   = currentClaimAmount !== null &&
                           Math.abs(currentClaimAmount - amount) < 0.01
            return (
              <button
                key={pct}
                onClick={() => { onPick(amount); onClose() }}
                className={`flex flex-col items-center py-4 sm:py-3 rounded-2xl border-2 transition-all touch-manipulation min-h-[56px] ${
                  isOn
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-gray-200 bg-gray-50 text-slate-700 hover:border-orange-300'
                }`}
              >
                <span className="text-base font-bold">
                  {pct === 100 ? 'All' : `${pct}%`}
                </span>
                <span className={`text-xs mt-0.5 ${isOn ? 'text-orange-100' : 'text-slate-400'}`}>
                  {fmtShort(amount)}
                </span>
              </button>
            )
          })}
        </div>

        {currentClaimAmount !== null && (
          <button
            onClick={() => { onRemove(); onClose() }}
            className="w-full py-3 border border-red-200 text-red-500 text-sm font-semibold rounded-xl"
          >
            Remove from claim
          </button>
        )}
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForemanGrid({ initialCells, otherSitesCells, initialGang, initialDays, stages, plotNumbers, cells }: Props) {
  const router = useRouter()

  const parseInitial = (): Map<string, Selection> => {
    const map = new Map<string, Selection>()
    if (!initialCells) return map
    for (const part of initialCells.split(',')) {
      const [id, penceStr] = part.trim().split(':')
      if (!id || !penceStr) continue
      const claimAmount = parseInt(penceStr) / 100
      const cell = cells.find((c) => c.id === id)
      if (cell) map.set(id, { fullValue: cell.contractValue, claimAmount })
    }
    return map
  }

  const [claimMode,    setClaimMode]    = useState(() => initialCells.length > 0)
  const [selections,   setSelections]   = useState<Map<string, Selection>>(parseInitial)
  const [pickerCellId, setPickerCellId] = useState<string | null>(null)

  const cellMap = new Map<string, Cell>()
  for (const c of cells) cellMap.set(`${c.plotNumber}__${c.stageId}`, c)

  // Claimable = has value AND not 100% already claimed
  const stageNameById  = new Map(stages.map((s) => [s.id, s.name]))
  const claimableCells = cells.filter((c) =>
    c.contractValue > 0 &&
    c.totalClaimedPct < 100 &&
    !isTotalStage(stageNameById.get(c.stageId) ?? '')
  )

  const pickAmount = (cellId: string, amount: number) => {
    const cell = cells.find((c) => c.id === cellId)
    if (!cell) return
    setSelections((prev) => new Map(prev).set(cellId, { fullValue: cell.contractValue, claimAmount: amount }))
  }

  const removeCell = (cellId: string) => {
    setSelections((prev) => { const next = new Map(prev); next.delete(cellId); return next })
  }

  // Toggle row — selects 100% of REMAINING for each cell
  const toggleRow = (plotNumber: string) => {
    const rowCells = claimableCells.filter((c) => c.plotNumber === plotNumber)
    const allOn    = rowCells.every((c) => selections.has(c.id))
    setSelections((prev) => {
      const next = new Map(prev)
      if (allOn) {
        rowCells.forEach((c) => next.delete(c.id))
      } else {
        rowCells.forEach((c) => {
          const remaining = Math.round(c.contractValue * (100 - c.totalClaimedPct) / 100 * 100) / 100
          next.set(c.id, { fullValue: c.contractValue, claimAmount: remaining })
        })
      }
      return next
    })
  }

  const selectedTotal = Array.from(selections.values())
    .reduce((sum, s) => sum + s.claimAmount, 0)

  const handleBuildClaim = () => {
    // Encode this site's selections as cellId:penceAmount
    const thisSiteParam = Array.from(selections.entries())
      .map(([id, { claimAmount }]) => `${id}:${Math.round(claimAmount * 100)}`)
      .join(',')
    // Merge with other sites' cells — always return to the multi-site claim builder
    const allCells = [thisSiteParam, otherSitesCells].filter(Boolean).join(',')
    const gangQ    = initialGang ? `&gang=${encodeURIComponent(initialGang)}` : ''
    const daysQ    = initialDays ? `&days=${encodeURIComponent(initialDays)}` : ''
    router.push(`/foreman/claim?cells=${allCells}${gangQ}${daysQ}`)
  }

  const exitClaimMode = () => {
    setClaimMode(false)
    setSelections(new Map())
  }

  const pickerCell = pickerCellId ? cells.find((c) => c.id === pickerCellId) ?? null : null

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            { color: 'bg-white border border-gray-300', label: 'Unclaimed'  },
            { color: 'bg-orange-300',                   label: 'Part Claimed' },
            { color: 'bg-blue-400',                     label: 'Submitted'   },
            { color: 'bg-green-500',                    label: 'Approved'    },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3.5 h-3.5 rounded ${color}`} />
              <span className="text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        {!claimMode ? (
          <button
            onClick={() => setClaimMode(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600
                       text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Select Lifts to Claim
          </button>
        ) : (
          <button
            onClick={exitClaimMode}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 hover:bg-gray-300
                       text-slate-600 text-xs font-semibold rounded-xl transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
      </div>

      {claimMode && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
          Tap a cell to choose how much to claim (25% / 50% / 75% / All remaining).
          Tap the plot number to select the whole row at full remaining value.
          Green cells are fully claimed and locked.
        </p>
      )}

      {/* Grid */}
      {plotNumbers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No grid data yet — your admin will upload the price sheet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="border-collapse text-sm foreman-grid-table" style={{ minWidth: `${(stages.length + 1) * 130}px` }}>
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 text-left font-semibold
                               text-xs whitespace-nowrap border-r border-slate-700 min-w-[88px] sm:min-w-[80px]">
                  Plot No
                </th>
                {stages.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-left font-semibold text-xs
                                            whitespace-nowrap border-r border-slate-700
                                            last:border-r-0 min-w-[120px] sm:min-w-[110px]">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plotNumbers.map((plotNo, rowIdx) => {
                const rowClaimable = claimableCells.filter((c) => c.plotNumber === plotNo)
                const rowAllOn     = rowClaimable.length > 0 && rowClaimable.every((c) => selections.has(c.id))
                const rowSomeOn    = rowClaimable.some((c) => selections.has(c.id))

                return (
                  <tr key={plotNo} className={rowIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td
                      className={`sticky left-0 z-10 px-3 font-semibold text-slate-800
                                  border-r border-gray-200 bg-inherit whitespace-nowrap
                                  ${claimMode ? 'py-3 min-h-[52px]' : 'py-2'}
                                  ${claimMode && rowClaimable.length > 0 ? 'cursor-pointer select-none active:bg-orange-50' : ''}`}
                      onClick={claimMode && rowClaimable.length > 0 ? () => toggleRow(plotNo) : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {claimMode && rowClaimable.length > 0 && (
                          rowAllOn
                            ? <CheckSquare className="w-4 h-4 text-orange-500 shrink-0" />
                            : rowSomeOn
                            ? <Square className="w-4 h-4 text-orange-300 shrink-0" />
                            : <Square className="w-4 h-4 text-gray-300 shrink-0" />
                        )}
                        {plotNo}
                      </div>
                    </td>

                    {stages.map((stage) => {
                      const cell = cellMap.get(`${plotNo}__${stage.id}`)
                      if (!cell) {
                        return (
                          <td key={stage.id}
                              className={`px-3 border-r border-gray-100 last:border-r-0
                                         text-gray-200 text-center ${claimMode ? 'py-3' : 'py-2'}`}>
                            —
                          </td>
                        )
                      }

                      const sel          = selections.get(cell.id)
                      const isTotalCol   = isTotalStage(stage.name)
                      const fullyLocked  = cell.totalClaimedPct >= 100 || isTotalCol
                      const isSelectable = claimMode && cell.contractValue > 0 && !fullyLocked
                      const bgCls        = sel
                        ? 'bg-orange-500 text-white'
                        : claimColor(cell.totalClaimedPct, cell.cellColor)

                      return (
                        <td
                          key={stage.id}
                          onClick={isSelectable ? () => setPickerCellId(cell.id) : undefined}
                          className={`px-3 border-r border-gray-100 last:border-r-0
                                      whitespace-nowrap transition-colors
                                      ${claimMode && isSelectable ? 'py-3 min-h-[52px]' : 'py-2'}
                                      ${bgCls}
                                      ${isSelectable ? 'cursor-pointer active:scale-[0.98] touch-manipulation' : ''}
                                      ${claimMode && fullyLocked ? 'opacity-70' : ''}`}
                        >
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1">
                              {claimMode && !fullyLocked && cell.contractValue > 0 && (
                                sel
                                  ? <CheckSquare className="w-3 h-3 shrink-0 opacity-80" />
                                  : <Square className="w-3 h-3 shrink-0 opacity-40" />
                              )}
                              {claimMode && fullyLocked && (
                                <Lock className="w-3 h-3 shrink-0 opacity-60" />
                              )}
                              <span className="text-xs font-medium">
                                {cell.overrideNote ?? fmtShort(cell.contractValue)}
                              </span>
                            </div>

                            {/* Claim status badge */}
                            {!sel && cell.totalClaimedPct > 0 && cell.totalClaimedPct < 100 && (
                              <span className="text-[10px] font-semibold bg-black/15 rounded px-1 leading-tight">
                                {cell.totalClaimedPct}% claimed
                              </span>
                            )}
                            {!sel && cell.totalClaimedPct >= 100 && (
                              <span className="text-[10px] font-semibold bg-black/15 rounded px-1 leading-tight">
                                Fully claimed
                              </span>
                            )}

                            {/* Selected amount badge */}
                            {sel && (
                              <span className="text-[10px] font-bold bg-white/25 rounded px-1 leading-tight">
                                {fmtShort(sel.claimAmount)}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating claim bar */}
      {claimMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700
                        px-4 py-4 z-30 safe-bottom-bar">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <p className="text-slate-400 text-xs">
                {selections.size} lift{selections.size !== 1 ? 's' : ''} selected
              </p>
              <p className="text-orange-400 text-xl font-bold leading-tight">
                {fmtFull(selectedTotal)}
              </p>
            </div>
            <button
              disabled={selections.size === 0}
              onClick={handleBuildClaim}
              className="flex items-center gap-2 px-6 py-3.5 bg-orange-500 hover:bg-orange-600
                         disabled:bg-slate-700 disabled:text-slate-500
                         text-white font-bold text-sm rounded-2xl transition-colors shrink-0"
            >
              <ClipboardList className="w-4 h-4" />
              Build Claim →
            </button>
          </div>
        </div>
      )}

      {/* Picker sheet */}
      {pickerCell && (
        <PctPicker
          cell={pickerCell}
          currentClaimAmount={selections.get(pickerCell.id)?.claimAmount ?? null}
          onPick={(amount) => pickAmount(pickerCell.id, amount)}
          onRemove={() => removeCell(pickerCell.id)}
          onClose={() => setPickerCellId(null)}
        />
      )}
    </div>
  )
}

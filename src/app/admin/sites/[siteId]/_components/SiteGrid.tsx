'use client'

import { useState } from 'react'
import CellEditorPanel, { type SelectedCell } from './CellEditorPanel'
import { ShieldCheck, X, Loader2 } from 'lucide-react'

type Stage = { id: string; stage_name: string; stage_order: number }
type Cell  = {
  id:               string
  plot_number:      string
  stage_id:         string
  contract_value:   number | null
  current_balance:  number | null
  cell_color:       string
  override_note:    string | null
  total_claimed_pct: number
}

interface Props {
  stages: Stage[]
  cells:  Cell[]
}

// Stages that are pre-calculated totals in the spreadsheet — exclude from row/grand totals
function isTotalStage(name: string): boolean {
  const n = name.toLowerCase().trim()
  return n.includes('total') || n.includes('subtotal') || n === 'sum'
}

// Colour driven by claim status (same system as foreman view)
function cellBg(cell: Cell, claimMode: boolean): string {
  if (cell.total_claimed_pct >= 100) return 'bg-green-500 text-white'
  if (cell.total_claimed_pct > 0)    return 'bg-orange-300 text-slate-800'
  const map: Record<string, string> = {
    white:  'bg-white',
    orange: 'bg-orange-300',
    blue:   'bg-blue-400 text-white',
    green:  'bg-green-400 text-white',
  }
  return map[cell.cell_color] ?? 'bg-white'
}

function fmt(v: number | null): string {
  if (v === null) return '—'
  return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Claim status picker ───────────────────────────────────────────────────────

const CLAIM_OPTIONS = [
  { label: 'Unclaimed',      pct: 0,   color: 'border-gray-200 bg-white text-slate-700'           },
  { label: '25%',            pct: 25,  color: 'border-orange-300 bg-orange-100 text-orange-700'   },
  { label: '50%',            pct: 50,  color: 'border-orange-400 bg-orange-200 text-orange-800'   },
  { label: '75%',            pct: 75,  color: 'border-orange-500 bg-orange-300 text-orange-900'   },
  { label: 'Fully Claimed',  pct: 100, color: 'border-green-500 bg-green-500 text-white'          },
]

function AdminClaimPicker({
  cell,
  onPick,
  onClose,
  saving,
}: {
  cell:    Cell
  onPick:  (pct: number) => void
  onClose: () => void
  saving:  boolean
}) {
  const fullValue = cell.contract_value ?? 0

  const isLocked = cell.total_claimed_pct > 0

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-10">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <p className="text-xs text-slate-500 mb-0.5">Plot {cell.plot_number}</p>
        <p className="text-base font-bold text-slate-900">{fmt(fullValue)} full value</p>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          Currently: <span className="font-semibold text-slate-600">
            {cell.total_claimed_pct === 0 ? 'Unclaimed'
              : cell.total_claimed_pct >= 100 ? 'Fully Claimed'
              : `${cell.total_claimed_pct}% Claimed`}
          </span>
        </p>

        {isLocked && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-4">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M5.07 19h13.86a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16a2 2 0 001.73 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">Locked — Claim in Progress</p>
              <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                This cell has been claimed by a foreman. The percentage can only be updated through the claim approval or rejection process to prevent mismatches.
              </p>
            </div>
          </div>
        )}

        {!isLocked && (saving ? (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Saving…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {CLAIM_OPTIONS.map(({ label, pct, color }) => {
              const amount = Math.round(fullValue * pct / 100)
              const isOn   = cell.total_claimed_pct === pct
              return (
                <button
                  key={pct}
                  onClick={() => onPick(pct)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2
                               font-semibold text-sm transition-all
                               ${isOn ? 'ring-2 ring-offset-1 ring-slate-400' : ''}
                               ${color}`}
                >
                  <span>{label}</span>
                  {pct > 0 && <span className="font-normal text-xs opacity-75">{fmt(amount)}</span>}
                  {isOn && <span className="text-xs ml-2 opacity-60">← current</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SiteGrid({ stages, cells: initialCells }: Props) {
  const [gridCells,    setGridCells]    = useState<Cell[]>(initialCells)
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [claimMode,    setClaimMode]    = useState(false)
  const [pickerCell,   setPickerCell]   = useState<Cell | null>(null)
  const [saving,       setSaving]       = useState(false)

  const cellMap = new Map<string, Map<string, Cell>>()
  for (const cell of gridCells) {
    if (!cellMap.has(cell.plot_number)) cellMap.set(cell.plot_number, new Map())
    cellMap.get(cell.plot_number)!.set(cell.stage_id, cell)
  }

  const plotNumbers = Array.from(new Set(gridCells.map((c) => c.plot_number))).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b)
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
  })

  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order)

  const handleCellClick = (cell: Cell, stage: Stage) => {
    if (claimMode) {
      setPickerCell(cell)  // picker shows locked state when total_claimed_pct > 0
      return
    }
    setSelectedCell({
      cellId:          cell.id,
      plotNumber:      cell.plot_number,
      stageName:       stage.stage_name,
      contractValue:   cell.contract_value,
      currentBalance:  cell.current_balance,
      cellColor:       cell.cell_color,
      overrideNote:    cell.override_note,
      totalClaimedPct: cell.total_claimed_pct,
    })
  }

  const handleSave = (updated: SelectedCell) => {
    setGridCells((prev) =>
      prev.map((c) =>
        c.id === updated.cellId
          ? { ...c, contract_value: updated.contractValue, current_balance: updated.currentBalance,
              cell_color: updated.cellColor, override_note: updated.overrideNote }
          : c
      )
    )
  }

  const handleClaimPick = async (pct: number) => {
    if (!pickerCell) return
    setSaving(true)

    // Determine color: 0=white, 1-99=orange, 100=green (admin-approved)
    const newColor = pct === 0 ? 'white' : pct >= 100 ? 'green' : 'orange'

    try {
      await fetch(`/api/cells/${pickerCell.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ total_claimed_pct: pct, cell_color: newColor }),
      })

      setGridCells((prev) =>
        prev.map((c) =>
          c.id === pickerCell.id
            ? { ...c, total_claimed_pct: pct, cell_color: newColor }
            : c
        )
      )
    } finally {
      setSaving(false)
      setPickerCell(null)
    }
  }

  return (
    <>
      {/* Claim mode toggle */}
      <div className="flex items-center justify-end mb-3">
        {!claimMode ? (
          <button
            onClick={() => setClaimMode(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Mark Claim Status
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-700 bg-green-50 border border-green-200
                             rounded-xl px-3 py-1.5 font-medium">
              Tap any cell to set its claim status
            </span>
            <button
              onClick={() => setClaimMode(false)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300
                         text-slate-600 text-xs font-semibold rounded-xl transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Done
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
        <table className="border-collapse text-sm" style={{ minWidth: `${(sortedStages.length + 1) * 120}px` }}>
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 text-left font-semibold
                             text-xs whitespace-nowrap border-r border-slate-700 min-w-[80px]">
                Plot No
              </th>
              {sortedStages.map((stage) => (
                <th key={stage.id}
                    className="px-3 py-3 text-left font-semibold text-xs whitespace-nowrap
                               border-r border-slate-700 min-w-[110px]">
                  {stage.stage_name}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-semibold text-xs whitespace-nowrap
                             bg-slate-700 text-orange-300 min-w-[110px]">
                Row Total
              </th>
            </tr>
          </thead>
          <tbody>
            {plotNumbers.map((plotNo, rowIdx) => (
              <tr key={plotNo} className={rowIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="sticky left-0 z-10 px-4 py-2 font-semibold text-slate-800
                               border-r border-gray-200 bg-inherit whitespace-nowrap">
                  {plotNo}
                </td>
                {sortedStages.map((stage) => {
                  const cell = cellMap.get(plotNo)?.get(stage.id)
                  if (!cell) {
                    return (
                      <td key={stage.id}
                          className="px-3 py-2 border-r border-gray-100 text-gray-300 text-center">
                        —
                      </td>
                    )
                  }

                  const bgCls = cellBg(cell, claimMode)

                  return (
                    <td
                      key={stage.id}
                      onClick={() => handleCellClick(cell, stage)}
                      className={`px-3 py-2 border-r border-gray-100 whitespace-nowrap
                                  cursor-pointer hover:opacity-80 transition-opacity ${bgCls}`}
                      title={claimMode
                        ? `Set claim status for Plot ${plotNo} — ${stage.stage_name}`
                        : `Edit Plot ${plotNo} — ${stage.stage_name}`}
                    >
                      <span className="text-xs font-medium">
                        {cell.override_note ?? fmt(cell.contract_value)}
                      </span>
                      {cell.total_claimed_pct > 0 && cell.total_claimed_pct < 100 && cell.contract_value !== null && (
                        <>
                          <span className="block text-[10px] opacity-80 font-semibold">
                            {cell.total_claimed_pct}% claimed
                          </span>
                          <span className="block text-[10px] opacity-70">
                            {fmt(Math.round(cell.contract_value * (100 - cell.total_claimed_pct)) / 100)} left
                          </span>
                        </>
                      )}
                      {cell.total_claimed_pct >= 100 && (
                        <span className="block text-[10px] opacity-70 font-semibold">✓ Fully Claimed</span>
                      )}
                    </td>
                  )
                })}
                {/* Row total — excludes any stage that is itself a pre-calculated total */}
                {(() => {
                  const rowTotal = sortedStages.reduce((sum, stage) =>
                    isTotalStage(stage.stage_name) ? sum : sum + (cellMap.get(plotNo)?.get(stage.id)?.contract_value ?? 0), 0)
                  return (
                    <td className="px-3 py-2 text-right font-bold text-slate-700 whitespace-nowrap bg-orange-50 border-l border-orange-200">
                      <span className="text-xs">{rowTotal > 0 ? fmt(rowTotal) : '—'}</span>
                    </td>
                  )
                })()}
              </tr>
            ))}

            {/* Totals row */}
            <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-600">
              <td className="sticky left-0 z-10 bg-slate-800 px-4 py-3 text-xs uppercase
                             tracking-wide border-r border-slate-600 whitespace-nowrap">
                TOTALS
              </td>
              {sortedStages.map((stage) => {
                const colTotal = plotNumbers.reduce((sum, p) =>
                  sum + (cellMap.get(p)?.get(stage.id)?.contract_value ?? 0), 0)
                const balTotal = plotNumbers.reduce((sum, p) =>
                  sum + (cellMap.get(p)?.get(stage.id)?.current_balance ?? 0), 0)
                const hasData  = plotNumbers.some(
                  (p) => (cellMap.get(p)?.get(stage.id)?.contract_value ?? null) !== null
                )
                return (
                  <td key={stage.id}
                      className="px-3 py-3 border-r border-slate-600 whitespace-nowrap">
                    {hasData ? (
                      <>
                        <span className="text-xs text-orange-300 font-bold block">{fmt(colTotal)}</span>
                        {balTotal > 0 && (
                          <span className="text-xs text-slate-400 block">bal: {fmt(balTotal)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>
                )
              })}
              {/* Grand total cell */}
              {(() => {
                const grandTotal = sortedStages.reduce((stageSum, stage) =>
                  isTotalStage(stage.stage_name) ? stageSum : stageSum + plotNumbers.reduce((plotSum, p) =>
                    plotSum + (cellMap.get(p)?.get(stage.id)?.contract_value ?? 0), 0), 0)
                return (
                  <td className="px-3 py-3 text-right whitespace-nowrap bg-orange-600 border-l border-orange-400">
                    <span className="text-xs text-white font-bold block">GRAND</span>
                    <span className="text-xs text-white font-bold block">{fmt(grandTotal)}</span>
                  </td>
                )
              })()}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Normal cell editor */}
      {selectedCell && !claimMode && (
        <CellEditorPanel
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
          onSave={handleSave}
        />
      )}

      {/* Claim status picker */}
      {pickerCell && claimMode && (
        <AdminClaimPicker
          cell={pickerCell}
          onPick={handleClaimPick}
          onClose={() => setPickerCell(null)}
          saving={saving}
        />
      )}
    </>
  )
}

'use client'

import { X } from 'lucide-react'
import type { ClaimHistoryEntry } from '@/lib/claims/load-site-claim-history'
import { summarizePlotBuilders } from '@/lib/claims/load-site-claim-history'
import { ClaimHistoryLines } from './ClaimHistoryPopover'

type Stage = { id: string; stage_name: string; stage_order: number }
type Cell = {
  id: string
  plot_number: string
  stage_id: string
  contract_value: number | null
  total_claimed_pct: number
}

function fmt(v: number | null): string {
  if (v === null) return '—'
  return '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function PlotHistoryPanel({
  plotNumber,
  stages,
  cells,
  history,
  onClose,
}: {
  plotNumber: string
  stages: Stage[]
  cells: Cell[]
  history: Record<string, ClaimHistoryEntry[]>
  onClose: () => void
}) {
  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const cellByStage = new Map(
    cells.filter((c) => c.plot_number === plotNumber).map((c) => [c.stage_id, c]),
  )

  const stageBlocks = sortedStages.map((stage) => {
    const cell = cellByStage.get(stage.id)
    const entries = cell ? (history[cell.id] ?? []) : []
    return {
      stageName: stage.stage_name,
      cell,
      entries,
    }
  })

  const builtBy = summarizePlotBuilders(
    stageBlocks.map(({ stageName, entries }) => ({ stageName, entries })),
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto
                      bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              Plot history
            </p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">Plot {plotNumber}</h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              <span className="font-semibold text-slate-800">Built by:</span> {builtBy}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 shrink-0"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="space-y-3">
          {stageBlocks.map(({ stageName, cell, entries }) => (
            <div
              key={stageName}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{stageName}</p>
                <p className="text-xs text-slate-500">{fmt(cell?.contract_value ?? null)}</p>
              </div>
              {cell && cell.total_claimed_pct > 0 && (
                <p className="text-[11px] text-slate-400">
                  Grid shows {cell.total_claimed_pct}% claimed
                </p>
              )}
              <ClaimHistoryLines entries={entries} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

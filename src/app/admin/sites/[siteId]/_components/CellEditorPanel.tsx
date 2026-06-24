'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

export type SelectedCell = {
  cellId:           string
  plotNumber:       string
  stageName:        string
  contractValue:    number | null
  currentBalance:   number | null
  cellColor:        string
  overrideNote:     string | null
  totalClaimedPct?: number
}

const COLOR_OPTIONS = [
  { value: 'white',  label: 'White',  bg: 'bg-white border-2 border-gray-300',    text: 'Not Started'  },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-400',                         text: 'In Progress'  },
  { value: 'blue',   label: 'Blue',   bg: 'bg-blue-500',                           text: 'Complete'     },
  { value: 'green',  label: 'Green',  bg: 'bg-green-500',                          text: 'Certified'    },
]

interface Props {
  cell:    SelectedCell
  onClose: () => void
  onSave:  (updated: SelectedCell) => void
}

export default function CellEditorPanel({ cell, onClose, onSave }: Props) {
  const [contractValue,  setContractValue]  = useState(cell.contractValue?.toString()  ?? '')
  const [currentBalance, setCurrentBalance] = useState(cell.currentBalance?.toString() ?? '')
  const [cellColor,      setCellColor]      = useState(cell.cellColor)
  const [overrideNote,   setOverrideNote]   = useState(cell.overrideNote ?? '')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const isLocked = (cell.totalClaimedPct ?? 0) > 0

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const body = {
      contract_value:  contractValue  !== '' ? parseFloat(contractValue)  : null,
      current_balance: currentBalance !== '' ? parseFloat(currentBalance) : null,
      cell_color:      cellColor,
      override_note:   overrideNote.trim() || null,
    }

    try {
      const res = await fetch(`/api/cells/${cell.cellId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to save changes')

      onSave({
        ...cell,
        contractValue:  body.contract_value,
        currentBalance: body.current_balance,
        cellColor:      body.cell_color,
        overrideNote:   body.override_note,
      })
      onClose()
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Handle + header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">
                {cell.stageName}
              </p>
              <h2 className="text-lg font-bold text-slate-900">Plot {cell.plotNumber}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Locked warning */}
          {isLocked && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6v2m0 6h.01M5.07 19h13.86a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16a2 2 0 001.73 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Locked — Claim in Progress</p>
                <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                  This cell has been partially or fully claimed ({cell.totalClaimedPct}% claimed).
                  Values cannot be edited until the claim is resolved to prevent mismatches.
                </p>
              </div>
            </div>
          )}

          {/* Contract value */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contract Value (£)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={contractValue}
                onChange={(e) => !isLocked && setContractValue(e.target.value)}
                placeholder="0.00"
                disabled={isLocked}
                className={`${inputCls} pl-7 ${isLocked ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
              />
            </div>
          </div>

          {/* Current balance */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Current Balance (£)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={currentBalance}
                onChange={(e) => !isLocked && setCurrentBalance(e.target.value)}
                placeholder="0.00"
                disabled={isLocked}
                className={`${inputCls} pl-7 ${isLocked ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
              />
            </div>
          </div>

          {/* Cell colour */}
          <div className={isLocked ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cell Status Colour
            </label>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCellColor(opt.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    cellColor === opt.value
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg shrink-0 ${opt.bg}`} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.text}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Override note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Override Note (optional)
            </label>
            <textarea
              value={overrideNote}
              onChange={(e) => !isLocked && setOverrideNote(e.target.value)}
              placeholder="e.g. Held – awaiting NHBC sign-off"
              rows={2}
              disabled={isLocked}
              className={`${inputCls} ${isLocked ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Save — hidden when locked */}
          {!isLocked && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

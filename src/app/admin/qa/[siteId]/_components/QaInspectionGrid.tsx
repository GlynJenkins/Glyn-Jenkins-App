'use client'

import { useState, useTransition } from 'react'
import { Check, Download, Loader2, X } from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'
import { QA_STAGES, qaStageLabel, type QaStageKey } from '@/lib/qa/stages'
import type { QaPlotRow, QaSiteGrid } from '@/lib/qa/queries'

type Props = {
  initialGrid: QaSiteGrid
  inspectorDefault: string
}

type OpenCell = {
  plotNumber: string
  stage:      QaStageKey
  existing:   QaPlotRow['stages'][QaStageKey]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function InspectionFormModal({
  siteId,
  cell,
  inspectorDefault,
  onClose,
  onSaved,
}: {
  siteId:           string
  cell:             OpenCell
  inspectorDefault: string
  onClose:          () => void
  onSaved:          (grid: QaSiteGrid) => void
}) {
  const [inspectorName,  setInspectorName]  = useState(inspectorDefault)
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10))
  const [observations,   setObservations]   = useState('')
  const [result,         setResult]         = useState('Pass')
  const [signatureBlob,  setSignatureBlob]  = useState<Blob | null>(null)
  const [sigError,       setSigError]       = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [submitting,     setSubmitting]     = useState(false)

  const completed = cell.existing?.status === 'completed'

  const submit = async () => {
    setError(null)
    setSigError(null)
    if (!inspectorName.trim()) { setError('Inspector name is required.'); return }
    if (!signatureBlob) { setSigError('Please sign the form.'); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('siteId', siteId)
      fd.append('plotNumber', cell.plotNumber)
      fd.append('stage', cell.stage)
      fd.append('inspectorName', inspectorName.trim())
      fd.append('inspectionDate', inspectionDate)
      fd.append('observations', observations)
      fd.append('result', result)
      fd.append('signature', new File([signatureBlob], 'signature.png', { type: 'image/png' }))

      const res  = await fetch('/api/qa/inspections', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Submission failed.')
        return
      }
      onSaved(json.grid)
      onClose()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Quality inspection</p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Plot {cell.plotNumber} · {qaStageLabel(cell.stage)}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {completed && cell.existing && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900">
              <p className="font-semibold">Already inspected</p>
              <p className="text-xs mt-1 text-green-800">
                {cell.existing.inspector
                  ? `${cell.existing.inspector.first_name} ${cell.existing.inspector.surname} · `
                  : ''}
                {cell.existing.inspected_at ? fmtDate(cell.existing.inspected_at) : ''}
              </p>
              {cell.existing.id && (
                <a
                  href={`/api/qa/inspections/${cell.existing.id}/pdf`}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-green-700 underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">
            {completed
              ? 'Submit again to replace this inspection record and PDF.'
              : 'Complete the inspection checklist below. Custom stage forms can be added later — for now use observations to record findings.'}
          </p>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Inspector name</label>
            <input
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Inspection date</label>
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Result</label>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="Pass">Pass</option>
              <option value="Pass with notes">Pass with notes</option>
              <option value="Fail">Fail</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Observations</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={4}
              placeholder="Record inspection findings…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-2 block">Signature</label>
            <SignaturePad
              onSigned={setSignatureBlob}
              onCleared={() => setSignatureBlob(null)}
              error={sigError ?? undefined}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {submitting ? 'Saving…' : completed ? 'Replace inspection & save PDF' : 'Complete inspection & save PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QaInspectionGrid({ initialGrid, inspectorDefault }: Props) {
  const [grid, setGrid] = useState(initialGrid)
  const [openCell, setOpenCell] = useState<OpenCell | null>(null)
  const [, startTransition] = useTransition()

  const totalSlots = grid.plots.length * QA_STAGES.length
  const completed = grid.plots.reduce(
    (n, p) => n + QA_STAGES.filter((s) => p.stages[s.key]?.status === 'completed').length,
    0,
  )
  const pct = totalSlots ? Math.round((completed / totalSlots) * 100) : 0

  if (grid.plots.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-slate-500">No plots on this site yet.</p>
        <p className="text-xs text-slate-400 mt-1">Upload the site price grid first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-slate-900">{grid.site_name}</p>
          <p className="text-xs text-slate-500">{completed} / {totalSlots} inspected</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Tap a stage cell to inspect. Completed stages turn green and can be downloaded as PDF.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 min-w-[72px]">
                  Plot
                </th>
                {grid.description_labels.map((label) => (
                  <th key={label} className="px-3 py-2.5 text-left font-medium text-slate-500 whitespace-nowrap max-w-[120px]">
                    {label}
                  </th>
                ))}
                {QA_STAGES.map((s) => (
                  <th key={s.key} className="px-2 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap min-w-[88px] bg-orange-50/40">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.plots.map((plot) => (
                <tr key={plot.plot_number} className="border-b border-gray-50 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-900">
                    {plot.plot_number}
                  </td>
                  {grid.description_labels.map((label) => {
                    const detail = plot.details.find((d) => d.label === label)
                    return (
                      <td key={`${plot.plot_number}-${label}`} className="px-3 py-2 text-slate-600 max-w-[120px] truncate">
                        {detail?.value ?? '—'}
                      </td>
                    )
                  })}
                  {QA_STAGES.map((s) => {
                    const record = plot.stages[s.key]
                    const done = record?.status === 'completed'
                    return (
                      <td key={s.key} className={`px-2 py-2 text-center ${done ? 'bg-green-50' : 'bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => setOpenCell({
                            plotNumber: plot.plot_number,
                            stage:      s.key,
                            existing:   record,
                          })}
                          className={`w-9 h-9 mx-auto rounded-lg flex items-center justify-center transition-colors border ${
                            done
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600'
                          }`}
                          title={`${plot.plot_number} — ${s.label}`}
                        >
                          {done ? <Check className="w-4 h-4" /> : <span className="w-3 h-3 rounded-sm border-2 border-current" />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openCell && (
        <InspectionFormModal
          siteId={grid.site_id}
          cell={openCell}
          inspectorDefault={inspectorDefault}
          onClose={() => setOpenCell(null)}
          onSaved={(updated) => startTransition(() => setGrid(updated))}
        />
      )}
    </div>
  )
}

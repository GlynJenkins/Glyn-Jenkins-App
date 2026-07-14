'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, CheckCircle, AlertCircle, ChevronRight, X } from 'lucide-react'

type SheetPreview = {
  name:         string
  usable:       boolean
  headers:      string[]
  stages:       string[]
  plotCount:    number
  headerRow:    number    // 1-based, display only
  headerRowIdx: number    // 0-based index into the raw rows, used by import
  plotColIndex: number
  colTotals?:   number[]
  sections?:    { houses: number; garages: number; screenWalls: number }
  sample?:      { plot: string; values: string[] }[]
}

export default function ExcelImporter({ siteId }: { siteId: string }) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const router     = useRouter()

  const [status,        setStatus]        = useState<'idle' | 'previewing' | 'ready' | 'importing' | 'success' | 'error'>('idle')
  const [message,       setMessage]       = useState<string | null>(null)
  const [sheets,        setSheets]        = useState<SheetPreview[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [plotColIndex,  setPlotColIndex]  = useState<number>(0)
  const [headerRowIdx,  setHeaderRowIdx]  = useState<number>(0)
  const [pendingFile,   setPendingFile]   = useState<File | null>(null)
  const [importReport,    setImportReport]    = useState<{ name: string; cells: number }[] | null>(null)
  const [importSummary,   setImportSummary]   = useState<string | null>(null)
  const [skippedExamples, setSkippedExamples] = useState<string[]>([])
  const [importedPlots,   setImportedPlots]   = useState<string[]>([])

  const selectedPreview = sheets.find((s) => s.name === selectedSheet)

  const handleFile = async (file: File) => {
    setStatus('previewing')
    setMessage(null)
    setPendingFile(file)

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res  = await fetch(`/api/sites/${siteId}/import/preview`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Preview failed')

      const allSheets    = json.sheets as SheetPreview[]
      const usableSheets = allSheets.filter((s) => s.usable)
      if (usableSheets.length === 0) {
        throw new Error('No data found in the file. Make sure the spreadsheet has at least two columns.')
      }

      setSheets(allSheets)
      setSelectedSheet(usableSheets[0].name)
      setPlotColIndex(usableSheets[0].plotColIndex ?? 0)
      setHeaderRowIdx(usableSheets[0].headerRowIdx ?? 0)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Preview failed.')
    }
  }

  const handleConfirm = async () => {
    if (!pendingFile || !selectedSheet) return
    setStatus('importing')
    setMessage(null)

    const fd = new FormData()
    fd.append('file', pendingFile)
    fd.append('sheetName', selectedSheet)
    fd.append('plotColIndex',  String(plotColIndex))
    fd.append('headerRowIdx',  String(headerRowIdx))

    try {
      const res  = await fetch(`/api/sites/${siteId}/import`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')

      setStatus('success')
      setImportReport(json.stageReport ?? null)
      setSkippedExamples(json.skippedExamples ?? [])
      setImportedPlots(json.plotList ?? [])
      // Log raw read info to browser console for diagnosis
      console.log('[Import Debug] totalRowsRead:', json.totalRowsRead)
      console.log('[Import Debug] plotList:', json.plotList)
      console.log('[Import Debug] boundaryDump:', json.boundaryDump)

      const plotRange = json.plotMin && json.plotMax
        ? ` · Plots: ${json.plotMin}–${json.plotMax} (${json.plotCount} total)`
        : ` · ${json.plotCount ?? 0} plots`
      const skipped = json.skippedRows > 0
        ? ` · ⚠ ${json.skippedRows} rows skipped (empty plot cell)`
        : ''
      setImportSummary(
        `Sheet: "${json.sheetUsed}" · Header row ${json.headerRow} · Plot column: "${json.plotColUsed}" · ` +
        `${json.stages} stages · ${json.cells} cells` + plotRange + skipped
      )
      setSheets([])
      setPendingFile(null)
      router.refresh()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  const reset = () => {
    setStatus('idle')
    setMessage(null)
    setSheets([])
    setPendingFile(null)
    setSelectedSheet(null)
    setPlotColIndex(0)
    setHeaderRowIdx(0)
    setImportReport(null)
    setImportSummary(null)
    setSkippedExamples([])
    setImportedPlots([])
  }

  return (
    <>
      {/* Upload button */}
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === 'previewing' || status === 'importing'}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600
                     disabled:bg-orange-300 text-white text-sm font-semibold rounded-xl
                     transition-colors shrink-0"
        >
          {status === 'previewing' || status === 'importing'
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {status === 'previewing' ? 'Reading…' : 'Importing…'}</>
            : <><Upload className="w-4 h-4" /> Import Excel</>
          }
        </button>

        {status === 'success' && importSummary && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{importSummary}</span>
            </div>
            {importReport && importReport.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-end">
                {importReport.map((s) => (
                  <span
                    key={s.name}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      s.cells === 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {s.name}: {s.cells}
                  </span>
                ))}
              </div>
            )}
            {importedPlots.length > 0 && (
              <div className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[10px] font-semibold text-slate-600 mb-1">
                  All imported plot numbers ({importedPlots.length}):
                </p>
                <p className="text-[10px] text-slate-500 font-mono break-all leading-relaxed">
                  {importedPlots.join(', ')}
                </p>
              </div>
            )}
            {skippedExamples.length > 0 && (
              <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[10px] font-semibold text-amber-700 mb-1">
                  Skipped rows (empty plot column) — check these in your spreadsheet:
                </p>
                {skippedExamples.map((ex, i) => (
                  <p key={i} className="text-[10px] text-amber-600 font-mono truncate">{ex}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {status === 'error' && message && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 max-w-xs text-right">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {message}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      {/* Preview modal */}
      {status === 'ready' && selectedPreview && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={reset} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
                          max-h-[85vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-8 space-y-5">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Confirm Import</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Review what was detected before importing</p>
                </div>
                <button onClick={reset}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              {/* Sheet selector */}
              {sheets.length > 1 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Select sheet to import:</p>
                  <div className="space-y-2">
                    {sheets.map((s) => (
                      <button
                        key={s.name}
                        onClick={() => { if (s.usable) { setSelectedSheet(s.name); setPlotColIndex(s.plotColIndex ?? 0); setHeaderRowIdx(s.headerRowIdx ?? 0) } }}
                        disabled={!s.usable}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2
                                    text-left transition-all ${
                          !s.usable ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                            : selectedSheet === s.name
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">
                            {s.usable
                              ? `${s.plotCount} plots · ${s.stages.length} stages · header row ${s.headerRow}`
                              : 'No "Plot No" header found'}
                          </p>
                        </div>
                        {selectedSheet === s.name && <ChevronRight className="w-4 h-4 text-orange-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected info */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sheet</span>
                  <span className="font-semibold text-slate-800">{selectedPreview.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Header found at row</span>
                  <span className="font-semibold text-slate-800">{selectedPreview.headerRow}</span>
                </div>

                {/* Plot column picker */}
                <div>
                  <p className="text-sm text-slate-500 mb-1.5">
                    Which column contains the <strong>Plot / Unit number</strong>?
                  </p>
                  <select
                    value={plotColIndex}
                    onChange={(e) => setPlotColIndex(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    {selectedPreview.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Plots detected</span>
                  <span className="font-semibold text-slate-800">{selectedPreview.plotCount}</span>
                </div>

                {selectedPreview.sections && (
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    {selectedPreview.sections.houses} houses
                    {selectedPreview.sections.garages > 0 && ` · ${selectedPreview.sections.garages} garages`}
                    {selectedPreview.sections.screenWalls > 0 && ` · ${selectedPreview.sections.screenWalls} screen walls`}
                  </div>
                )}

                <div>
                  <p className="text-sm text-slate-500 mb-1">
                    Stages ({selectedPreview.headers.filter((_, i) => i !== plotColIndex && selectedPreview.headers[i] !== '').length}):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreview.headers.map((h, i) =>
                      i !== plotColIndex && h ? (
                        <span key={i} className="text-xs bg-orange-100 text-orange-700 font-medium px-2.5 py-1 rounded-full">
                          {h}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              </div>

              {/* Sample rows */}
              {selectedPreview.sample && selectedPreview.sample.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    Preview (first {selectedPreview.sample.length} of {selectedPreview.plotCount} plots):
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="text-xs w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-500 font-medium">Plot</th>
                          {selectedPreview.headers.filter((h, i) => i !== plotColIndex && h).map((s) => (
                            <th key={s} className="px-3 py-2 text-right text-slate-500 font-medium whitespace-nowrap">{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedPreview.sample.map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{row.plot}</td>
                            {row.values.map((v, j) => (
                              <td key={j} className={`px-3 py-2 text-right ${!v ? 'text-slate-300' : v.startsWith('£') ? 'text-slate-700' : 'text-blue-600'}`}>
                                {v || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {selectedPreview.plotCount > selectedPreview.sample.length && (
                          <tr>
                            <td colSpan={selectedPreview.headers.filter((h, i) => i !== plotColIndex && h).length + 1}
                                className="px-3 py-1.5 text-center text-slate-400 italic text-[11px]">
                              … {selectedPreview.plotCount - selectedPreview.sample.length} more plots not shown
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {selectedPreview.colTotals && selectedPreview.colTotals.length > 0 && (
                        <tfoot className="bg-orange-50 border-t-2 border-orange-200">
                          <tr>
                            <td className="px-3 py-2 font-bold text-slate-800 text-xs">
                              TOTAL ({selectedPreview.plotCount} plots)
                            </td>
                            {selectedPreview.colTotals.map((total, j) => (
                              <td key={j} className="px-3 py-2 text-right font-bold text-orange-700 text-xs whitespace-nowrap">
                                {total > 0
                                  ? `£${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
                                  : '—'}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="px-3 pb-2 text-[11px] text-slate-500 italic" colSpan={
                              selectedPreview.headers.filter((h, i) => i !== plotColIndex && h).length + 1
                            }>
                              Grand total:{' '}
                              <span className="font-bold text-orange-700">
                                £{selectedPreview.colTotals.reduce((a, b) => a + b, 0)
                                    .toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Importing will <strong>replace all existing stages and price grid data</strong> for this site.
                  Any cells already claimed by a foreman will be reset. Make sure to review before confirming.
                </p>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold
                           py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-4 h-4" /> Confirm Import
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

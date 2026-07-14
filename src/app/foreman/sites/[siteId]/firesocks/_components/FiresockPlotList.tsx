'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Camera, Check, ChevronRight, Download, ImagePlus, Loader2, Shield, Trash2, X,
} from 'lucide-react'
import { prepareFiresockPhotoForUpload } from '@/lib/qa/prepare-photo-upload'
import { MIN_FIRESOCK_PHOTOS, FIRESOCK_EVIDENCE_LABEL } from '@/lib/firesock/constants'
import type { FiresockPlotRow, FiresockSiteGrid } from '@/lib/firesock/queries'

type Props = {
  siteId:       string
  initialGrid:  FiresockSiteGrid
  canUpload?:            boolean
  showPlotPdfDownloads?: boolean
}

function PlotDetailLine({ plot }: { plot: FiresockPlotRow }) {
  if (!plot.details.length) return null
  return (
    <p className="text-xs text-slate-500 mt-0.5 truncate">
      {plot.details.map((d) => d.value).join(' · ')}
    </p>
  )
}

function PlotRowContent({ plot }: { plot: FiresockPlotRow }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="font-semibold text-slate-900">Plot {plot.plot_number}</p>
        {plot.evidence_met ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <Check className="w-3 h-3" /> Complete
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {plot.photo_count}/{MIN_FIRESOCK_PHOTOS}
          </span>
        )}
      </div>
      <PlotDetailLine plot={plot} />
    </>
  )
}

function UploadModal({
  siteId,
  plot,
  onClose,
  onGridUpdate,
}: {
  siteId:        string
  plot:          FiresockPlotRow
  onClose:       () => void
  onGridUpdate:  (grid: FiresockSiteGrid) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const next: File[] = []
    const urls: string[] = []
    try {
      for (const file of Array.from(files)) {
        const prepared = await prepareFiresockPhotoForUpload(file)
        next.push(prepared)
        urls.push(URL.createObjectURL(prepared))
      }
      setPending((prev) => [...prev, ...next])
      setPreviews((prev) => [...prev, ...urls])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo.')
    }
  }

  const removePending = (idx: number) => {
    setPreviews((prev) => {
      const url = prev[idx]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== idx)
    })
    setPending((prev) => prev.filter((_, i) => i !== idx))
  }

  const deleteSavedPhoto = (photoId: string) => {
    setError(null)
    setBusyPhotoId(photoId)
    startTransition(async () => {
      const res  = await fetch(`/api/firesock/photos/${photoId}`, { method: 'DELETE' })
      const text = await res.text()
      let json: { error?: string; grid?: FiresockSiteGrid }
      try {
        json = JSON.parse(text) as { error?: string; grid?: FiresockSiteGrid }
      } catch {
        setBusyPhotoId(null)
        setError('Could not remove photo. Try again.')
        return
      }
      setBusyPhotoId(null)
      if (!res.ok) {
        setError(json.error ?? 'Could not remove photo.')
        return
      }
      if (json.grid) onGridUpdate(json.grid)
    })
  }

  const handleUpload = async () => {
    if (pending.length === 0) return
    setUploading(true)
    setError(null)
    setUploadProgress(`Uploading 0 of ${pending.length}…`)
    try {
      let latestGrid: FiresockSiteGrid | undefined

      for (let i = 0; i < pending.length; i++) {
        setUploadProgress(`Uploading ${i + 1} of ${pending.length}…`)
        const fd = new FormData()
        fd.append('plotNumber', plot.plot_number)
        fd.append('photos', pending[i]!)

        const res  = await fetch(`/api/firesock/${siteId}/photos`, { method: 'POST', body: fd })
        const text = await res.text()
        let json: { error?: string; grid?: FiresockSiteGrid }
        try {
          json = JSON.parse(text) as { error?: string; grid?: FiresockSiteGrid }
        } catch {
          throw new Error(
            `Upload failed (photo ${i + 1}). Check your connection and try again.`,
          )
        }
        if (!res.ok) throw new Error(json.error ?? `Upload failed on photo ${i + 1}.`)
        latestGrid = json.grid
      }

      previews.forEach((u) => URL.revokeObjectURL(u))
      setPending([])
      setPreviews([])
      if (latestGrid) onGridUpdate(latestGrid)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const totalAfter = plot.photo_count + pending.length
  const needMore   = Math.max(0, MIN_FIRESOCK_PHOTOS - totalAfter)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-900">Plot {plot.plot_number}</p>
            <p className="text-xs text-slate-500">{FIRESOCK_EVIDENCE_LABEL}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <PlotDetailLine plot={plot} />

          <div className={`rounded-xl px-4 py-3 text-sm ${
            plot.evidence_met
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}>
            {plot.photo_count} photo{plot.photo_count !== 1 ? 's' : ''} saved
            {!plot.evidence_met && ` · ${MIN_FIRESOCK_PHOTOS - plot.photo_count} more needed`}
          </div>

          {plot.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {plot.photos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-xl bg-slate-100 overflow-hidden">
                  {photo.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                      Photo {photo.sort_order + 1}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busyPhotoId === photo.id || uploading}
                    onClick={() => deleteSavedPhoto(photo.id)}
                    className="absolute top-1 right-1 p-1.5 bg-black/50 rounded-full text-white disabled:opacity-50"
                    aria-label={`Remove photo ${photo.sort_order + 1}`}
                  >
                    {busyPhotoId === photo.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {previews.map((url, idx) => (
                <div key={url} className="relative aspect-square rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePending(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-600 hover:border-orange-300 hover:text-orange-600"
          >
            <Camera className="w-4 h-4" />
            Add photos
          </button>

          {pending.length > 0 && (
            <p className="text-xs text-slate-500 text-center">
              {pending.length} new photo{pending.length !== 1 ? 's' : ''} selected
              {needMore > 0 && ` · ${needMore} more required after upload`}
            </p>
          )}

          {uploadProgress && uploading && (
            <p className="text-xs text-slate-500 text-center">{uploadProgress}</p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            disabled={pending.length === 0 || uploading}
            onClick={handleUpload}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-2xl flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {pending.length > 0
              ? `Upload ${pending.length} photo${pending.length !== 1 ? 's' : ''}`
              : 'Select photos above to upload'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-sm font-semibold text-slate-600 hover:text-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FiresockPlotList({
  siteId,
  initialGrid,
  canUpload = true,
  showPlotPdfDownloads = false,
}: Props) {
  const [grid, setGrid] = useState(initialGrid)
  const [openPlot, setOpenPlot] = useState<FiresockPlotRow | null>(null)
  const [filter, setFilter] = useState<'all' | 'missing'>('all')

  const required = grid.plots.filter((p) => p.requires_evidence)
  const complete = required.filter((p) => p.evidence_met).length
  const pct = required.length ? Math.round((complete / required.length) * 100) : 0

  const visible = filter === 'missing'
    ? required.filter((p) => !p.evidence_met)
    : required

  const handleGridUpdate = (updated: FiresockSiteGrid) => {
    setGrid(updated)
    if (openPlot) {
      const plot = updated.plots.find((p) => p.plot_number === openPlot.plot_number)
      if (plot) setOpenPlot(plot)
    }
  }

  if (required.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No plots requiring firesock evidence yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Upload the site price grid — house plots will appear here automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-slate-900">{grid.site_name}</p>
          <p className="text-xs text-slate-500">{complete} / {required.length} complete</p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Minimum {MIN_FIRESOCK_PHOTOS} photos per plot before Roof completion can be claimed.
        </p>
      </div>

      <div className="flex gap-2">
        {(['all', 'missing'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              filter === key
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-gray-200 text-slate-600'
            }`}
          >
            {key === 'all' ? 'All plots' : 'Missing only'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            {FIRESOCK_EVIDENCE_LABEL}
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {visible.map((plot) => (
            <div key={plot.plot_number} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                {canUpload ? (
                  <button
                    type="button"
                    onClick={() => setOpenPlot(grid.plots.find((p) => p.plot_number === plot.plot_number) ?? plot)}
                    className="flex-1 text-left min-w-0 hover:opacity-80"
                  >
                    <PlotRowContent plot={plot} />
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <PlotRowContent plot={plot} />
                  </div>
                )}
                {canUpload ? (
                  <button
                    type="button"
                    onClick={() => setOpenPlot(grid.plots.find((p) => p.plot_number === plot.plot_number) ?? plot)}
                    className="shrink-0 p-2 rounded-xl bg-orange-50 text-orange-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : showPlotPdfDownloads && plot.photo_count > 0 ? (
                  <a
                    href={`/api/firesock/${siteId}/plots/${encodeURIComponent(plot.plot_number)}/pdf`}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {openPlot && canUpload && (
        <UploadModal
          siteId={siteId}
          plot={openPlot}
          onClose={() => setOpenPlot(null)}
          onGridUpdate={handleGridUpdate}
        />
      )}
    </div>
  )
}

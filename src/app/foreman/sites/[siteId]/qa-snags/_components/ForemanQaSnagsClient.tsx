'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  X,
} from 'lucide-react'
import { preparePhotoForUpload } from '@/lib/qa/prepare-photo-upload'
import { isImageUploadFile } from '@/lib/qa/inspection-photos'

type SnagItem = {
  id:               string
  round:            number
  description:      string
  fixed:            boolean
  fixed_at:         string | null
  fixed_note:       string | null
  raised_photo_url: string | null
  fixed_photo_url:  string | null
}

type Group = {
  inspectionId:    string
  plotNumber:      string
  stage:           string
  stageLabel:      string
  inspectionState: string
  inspectedAt:     string | null
  snags:           SnagItem[]
  openCount:       number
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function MarkDoneForm({
  snagId,
  onDone,
}: {
  snagId: string
  onDone: (inspectionState: string) => void
}) {
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const setPhotoFile = async (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    if (!file) {
      setPhoto(null)
      setPreview(null)
      return
    }
    if (!isImageUploadFile(file)) {
      setError('Please choose a photo (JPEG, PNG, or HEIC).')
      return
    }
    setError(null)
    try {
      const prepared = await preparePhotoForUpload(file)
      setPhoto(prepared)
      setPreview(URL.createObjectURL(prepared))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo.')
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      if (note.trim()) fd.append('note', note.trim())
      if (photo) fd.append('photo', photo, photo.name || 'fix.jpg')
      const res = await fetch(`/api/foreman/qa-snags/${snagId}/fix`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not mark done.')
      onDone(json.inspectionState ?? 'awaiting_reinspection')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark done.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-red-100 pt-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional note about the fix…"
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none"
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void setPhotoFile(e.target.files?.[0] ?? null)
          if (e.currentTarget) e.currentTarget.value = ''
        }}
      />
      {preview && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Fix preview"
            className="w-full max-h-36 object-contain rounded-lg border border-slate-200 bg-white"
          />
          <button
            type="button"
            onClick={() => void setPhotoFile(null)}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 border border-slate-200 text-slate-600"
            aria-label="Remove photo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800"
        >
          <Camera className="w-3.5 h-3.5" />
          {photo ? 'Change photo' : 'Photo of fix'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Mark done
        </button>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  )
}

export default function ForemanQaSnagsClient({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [openTotal, setOpenTotal] = useState(0)
  const [expandedFix, setExpandedFix] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/foreman/qa-snags?siteId=${encodeURIComponent(siteId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load snags.')
      setGroups(json.groups ?? [])
      setOpenTotal(json.openTotal ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load snags.')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-100 p-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 text-xs font-semibold text-orange-700"
        >
          Try again
        </button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
        <p className="text-sm text-slate-600 font-medium">No quality snags on this site</p>
        <p className="text-xs text-slate-400 mt-1">New items appear here when management fails an inspection.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        {openTotal > 0 ? (
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        ) : (
          <Clock className="w-5 h-5 text-amber-500 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {openTotal > 0
              ? `${openTotal} open item${openTotal === 1 ? '' : 's'} to action`
              : 'All items marked done — waiting for re-inspection'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Mark each defect fixed (photo optional). When all are done, management re-inspects.
          </p>
        </div>
      </div>

      {groups.map((group) => (
        <section
          key={group.inspectionId}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">
                Plot {group.plotNumber} · {group.stageLabel}
              </p>
              {group.inspectedAt && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Raised {fmtDate(group.inspectedAt)}
                </p>
              )}
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                group.inspectionState === 'awaiting_reinspection'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {group.inspectionState === 'awaiting_reinspection'
                ? 'Awaiting re-inspection'
                : `${group.openCount} open`}
            </span>
          </div>

          <ul className="divide-y divide-gray-50">
            {group.snags.map((snag) => (
              <li key={snag.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Round {snag.round}
                    </p>
                    <p className="text-sm text-slate-900 mt-0.5">{snag.description}</p>
                  </div>
                  {snag.fixed ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">
                      Done
                    </span>
                  ) : null}
                </div>

                {snag.raised_photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={snag.raised_photo_url}
                    alt="Defect"
                    className="w-full max-h-40 object-contain rounded-lg border border-slate-200 bg-slate-50"
                  />
                )}

                {snag.fixed && (
                  <div className="text-xs text-slate-600 space-y-1">
                    {snag.fixed_note && <p>Note: {snag.fixed_note}</p>}
                    {snag.fixed_photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={snag.fixed_photo_url}
                        alt="Fix"
                        className="w-full max-h-36 object-contain rounded-lg border border-slate-200 bg-white"
                      />
                    )}
                    {snag.fixed_at && (
                      <p className="text-slate-400">Marked {fmtDate(snag.fixed_at)}</p>
                    )}
                  </div>
                )}

                {!snag.fixed && group.inspectionState === 'failed_open' && (
                  expandedFix === snag.id ? (
                    <MarkDoneForm
                      snagId={snag.id}
                      onDone={() => {
                        setExpandedFix(null)
                        void load()
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedFix(snag.id)}
                      className="text-xs font-semibold text-orange-700 hover:text-orange-800"
                    >
                      Mark done…
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, CheckCircle2, Loader2,
  Pencil, Share2, Trash2, X, Download, ImagePlus,
} from 'lucide-react'
import { prepareVariationPhotoForUpload } from '@/lib/qa/prepare-photo-upload'

type Photo = { id: string; url: string | null }
type Item = {
  id: string
  plotNumber: string
  description: string
  photos: Photo[]
}
type Recipient = {
  id: string
  workerId: string | null
  workerName: string
  sentVia: string
  sentAt: string
  deliveryStatus: string
  errorMessage: string | null
}
type WorkerOpt = { id: string; name: string; role: string }

const FREE_PLOTS = ['Compound', 'Scaffold', 'General']

export default function SiteAuditClient({
  audit,
  initialItems,
  initialRecipients,
  plotNumbers,
  assignedForemen,
  otherRecipients,
}: {
  audit: {
    id: string
    siteId: string
    siteName: string
    auditedByName: string
    auditedByRole: string | null
    auditDate: string
    generalNotes: string | null
    status: string
    pdfReady: boolean
  }
  initialItems: Item[]
  initialRecipients: Recipient[]
  plotNumbers: string[]
  assignedForemen: WorkerOpt[]
  otherRecipients: WorkerOpt[]
}) {
  const router = useRouter()
  const isDraft = audit.status === 'draft'

  const [items, setItems] = useState(initialItems)
  const [recipients, setRecipients] = useState(initialRecipients)
  const [error, setError] = useState<string | null>(null)

  // Add item form
  const [plot, setPlot] = useState('')
  const [description, setDescription] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [savingItem, setSavingItem] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null)
  const [recentPlots, setRecentPlots] = useState<string[]>([])

  // Complete flow
  const [step, setStep] = useState<'walk' | 'notes' | 'send' | 'done'>('walk')
  const [notes, setNotes] = useState(audit.generalNotes ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => assignedForemen.map((f) => f.id),
  )
  const [completing, setCompleting] = useState(false)
  const [deliveries, setDeliveries] = useState<{
    workerId: string
    workerName: string
    status: string
    error?: string
  }[]>([])

  const [lightbox, setLightbox] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPlot, setEditPlot] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const plotChips = useMemo(() => {
    const set = new Set([...recentPlots, ...plotNumbers, ...FREE_PLOTS])
    return [...set]
  }, [plotNumbers, recentPlots])

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const item of items) {
      const key = item.plotNumber
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [items])

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  const saveItem = async () => {
    setError(null)
    if (!plot.trim() || !description.trim()) {
      setError('Plot and description are required.')
      return
    }
    setSavingItem(true)
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotNumber: plot.trim(), description: description.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save item.')

      let newItem: Item = {
        id: json.item.id,
        plotNumber: json.item.plotNumber,
        description: json.item.description,
        photos: [],
      }

      for (const file of pendingPhotos) {
        setUploadingPhoto(file.name)
        const prepared = await prepareVariationPhotoForUpload(file)
        const fd = new FormData()
        fd.append('photo', prepared)
        const up = await fetch(
          `/api/admin/site-audits/${audit.id}/items/${newItem.id}/photos`,
          { method: 'POST', body: fd },
        )
        const upJson = await up.json()
        if (!up.ok) throw new Error(upJson.error ?? 'Photo upload failed.')
        newItem = {
          ...newItem,
          photos: [...newItem.photos, { id: upJson.photo.id, url: upJson.photo.url }],
        }
      }

      setItems((prev) => [...prev, newItem])
      setRecentPlots((prev) => [plot.trim(), ...prev.filter((p) => p !== plot.trim())].slice(0, 8))
      setPlot('')
      setDescription('')
      setPendingPhotos([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item.')
    } finally {
      setUploadingPhoto(null)
      setSavingItem(false)
    }
  }

  const removeItem = async (itemId: string) => {
    if (!window.confirm('Remove this item?')) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/items/${itemId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not remove item.')
      setItems((prev) => prev.filter((i) => i.id !== itemId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove item.')
    }
  }

  const removePhoto = async (itemId: string, photoId: string) => {
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/site-audits/${audit.id}/items/${itemId}/photos?photoId=${photoId}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not remove photo.')
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, photos: i.photos.filter((p) => p.id !== photoId) }
            : i,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove photo.')
    }
  }

  const addPhotosToItem = async (itemId: string, files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    for (const file of Array.from(files)) {
      setUploadingPhoto(file.name)
      try {
        const prepared = await prepareVariationPhotoForUpload(file)
        const fd = new FormData()
        fd.append('photo', prepared)
        const res = await fetch(
          `/api/admin/site-audits/${audit.id}/items/${itemId}/photos`,
          { method: 'POST', body: fd },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Photo upload failed.')
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, photos: [...i.photos, { id: json.photo.id, url: json.photo.url }] }
              : i,
          ),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Photo upload failed.')
      }
    }
    setUploadingPhoto(null)
  }

  const saveEdit = async (itemId: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plotNumber: editPlot, description: editDesc }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not update item.')
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, plotNumber: editPlot.trim(), description: editDesc.trim() }
            : i,
        ),
      )
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update item.')
    }
  }

  const complete = async () => {
    setError(null)
    setCompleting(true)
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generalNotes: notes,
          recipientWorkerIds: selectedIds,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not complete audit.')
      setDeliveries(json.deliveries ?? [])
      setStep('done')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete audit.')
    } finally {
      setCompleting(false)
    }
  }

  const resend = async (workerIds: string[]) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientWorkerIds: workerIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Resend failed.')
      setDeliveries((prev) => [...(json.deliveries ?? []), ...prev])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resend failed.')
    }
  }

  const downloadPdf = async () => {
    try {
      const res = await fetch(`/api/admin/site-audits/${audit.id}/pdf`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Download failed.')
      if (navigator.share && json.url) {
        try {
          const fileRes = await fetch(json.url)
          const blob = await fileRes.blob()
          const file = new File([blob], json.filename || 'site-audit.pdf', {
            type: 'application/pdf',
          })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: `Site Audit — ${audit.siteName}`,
              files: [file],
            })
            return
          }
        } catch {
          /* fall through to open */
        }
      }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    }
  }

  // ── Completed / done view ──────────────────────────────────
  if (!isDraft || step === 'done') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
          <p className="text-sm text-slate-500">
            {fmt(audit.auditDate)} · {audit.auditedByName}
            {audit.auditedByRole ? ` (${audit.auditedByRole})` : ''}
          </p>
          <p className="font-semibold text-slate-900">
            {items.length} item{items.length === 1 ? '' : 's'}
          </p>
          {audit.generalNotes && (
            <p className="text-sm text-slate-600 pt-2 border-t border-gray-50 mt-2">
              {audit.generalNotes}
            </p>
          )}
        </div>

        {grouped.map(([plotKey, plotItems]) => (
          <div key={plotKey} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-bold text-slate-900">Plot {plotKey}</p>
            {plotItems.map((item) => (
              <div key={item.id} className="space-y-2 border-t border-gray-50 pt-2">
                <p className="text-sm text-slate-700">{item.description}</p>
                {item.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.photos.map((p) =>
                      p.url ? (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setLightbox(p.url)}
                          className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {(recipients.length > 0 || deliveries.length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="font-semibold text-slate-800 text-sm">Sent to</p>
            {deliveries.map((d, i) => (
              <div key={`${d.workerId}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {d.workerName}
                  {d.status === 'sent' ? ' ✓' : ` — failed${d.error ? `: ${d.error}` : ''}`}
                </span>
                {d.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => void resend([d.workerId])}
                    className="text-xs font-semibold text-orange-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
            {recipients
              .filter((r) => !deliveries.some((d) => d.workerId === r.workerId))
              .map((r) => (
                <p key={r.id} className="text-sm text-slate-600">
                  {r.workerName}
                  {r.deliveryStatus === 'sent' ? ' ✓' : ` — ${r.deliveryStatus}`}
                  {r.sentVia && r.sentVia !== 'none' ? ` · ${r.sentVia}` : ''}
                </p>
              ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadPdf()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900
                       text-white text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-50
                       text-orange-700 text-sm font-semibold"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        {lightbox && (
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl" />
          </button>
        )}
      </div>
    )
  }

  // ── Notes step ─────────────────────────────────────────────
  if (step === 'notes') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Optional overall comments — housekeeping, standout good work, etc.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Overall site comments…"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none
                     focus:ring-2 focus:ring-orange-400"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep('walk')}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep('send')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            Next — send to foremen
          </button>
        </div>
      </div>
    )
  }

  // ── Send step ──────────────────────────────────────────────
  if (step === 'send') {
    const toggle = (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Assigned foremen are pre-selected. Tick anyone else with a portal login who should get the report.
        </p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {[...assignedForemen, ...otherRecipients].map((w) => (
            <label key={w.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(w.id)}
                onChange={() => toggle(w.id)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-400"
              />
              <span className="text-slate-800 font-medium">{w.name}</span>
              <span className="text-xs text-slate-400 ml-auto">{w.role}</span>
            </label>
          ))}
        </div>
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep('notes')}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600"
          >
            Back
          </button>
          <button
            type="button"
            disabled={completing}
            onClick={() => void complete()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                       bg-orange-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Complete &amp; send
          </button>
        </div>
      </div>
    )
  }

  // ── Walk ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{fmt(audit.auditDate)}</p>
          <p className="text-sm font-semibold text-slate-900">{audit.auditedByName}</p>
        </div>
        <p className="text-sm font-bold text-orange-600">
          {items.length} item{items.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Add item */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="font-semibold text-slate-800 text-sm">Add item</p>
        <div>
          <p className="text-xs text-slate-500 mb-2">Plot number</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {plotChips.slice(0, 24).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlot(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  plot === p
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-slate-50 text-slate-700 border-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={plot}
            onChange={(e) => setPlot(e.target.value)}
            placeholder="Or type plot / area…"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none
                       focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">What needs actioning?</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the issue…"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none
                       focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50
                            text-orange-700 text-sm font-medium cursor-pointer">
            <Camera className="w-4 h-4" />
            Add photos
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files
                if (files?.length) {
                  setPendingPhotos((prev) => [...prev, ...Array.from(files)])
                }
                e.target.value = ''
              }}
            />
          </label>
          {pendingPhotos.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              {pendingPhotos.length} photo{pendingPhotos.length === 1 ? '' : 's'} ready — upload on Save
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={savingItem}
          onClick={() => void saveItem()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                     bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {savingItem ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {uploadingPhoto ? 'Uploading photo…' : 'Saving…'}
            </>
          ) : (
            'Save item'
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Items list */}
      {grouped.map(([plotKey, plotItems]) => (
        <div key={plotKey} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="font-bold text-slate-900">Plot {plotKey}</p>
          {plotItems.map((item) => (
            <div key={item.id} className="border-t border-gray-50 pt-3 space-y-2">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editPlot}
                    onChange={(e) => setEditPlot(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-700">{item.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.photos.map((p) => (
                      <div key={p.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-100">
                        {p.url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => void removePhoto(item.id, p.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60
                                     text-white flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 rounded-lg border border-dashed border-gray-300
                                      flex items-center justify-center text-slate-400 cursor-pointer">
                      <ImagePlus className="w-5 h-5" />
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void addPhotosToItem(item.id, e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id)
                        setEditPlot(item.plotNumber)
                        setEditDesc(item.description)
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}

      <button
        type="button"
        disabled={items.length === 0}
        onClick={() => setStep('notes')}
        className="w-full px-4 py-3 rounded-2xl bg-orange-600 text-white font-semibold text-sm
                   disabled:opacity-40"
      >
        Complete audit
      </button>
    </div>
  )
}

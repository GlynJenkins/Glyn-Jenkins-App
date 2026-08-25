'use client'

import { useEffect, useRef, useState, useTransition, useMemo } from 'react'
import {
  AlertCircle,
  Camera,
  Check,
  Clock,
  Download,
  ImagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'
import {
  QA_STAGES,
  qaStageLabel,
  stageRequiresFiresock,
  stageAllowsFiresockNa,
  firesockRequirementMet,
  type QaStageKey,
} from '@/lib/qa/stages'
import { MAX_QA_INSPECTION_PHOTOS, isImageUploadFile } from '@/lib/qa/inspection-photos'
import { preparePhotoForUpload } from '@/lib/qa/prepare-photo-upload'
import {
  checklistForStage,
  emptyChecklistAnswers,
  parseChecklistAnswers,
  stageHasChecklist,
  checklistAllAnswered,
  failingChecklistItems,
  snagDescriptionFromChecklistItem,
  type QaChecklistAnswers,
  type QaChecklistValue,
} from '@/lib/qa/checklists'
import { qaCellTone, qaStateLabel, type QaInspectionState } from '@/lib/qa/inspection-state'
import type { QaPlotRow, QaSiteGrid } from '@/lib/qa/queries'

type Props = {
  initialGrid: QaSiteGrid
  inspectorDefault: string
  assignedForemen?: { id: string; name: string }[]
}

type OpenCell = {
  plotNumber: string
  stage:      QaStageKey
  existing:   QaPlotRow['stages'][QaStageKey]
}

type PendingPhoto = {
  id:      string
  file:    File
  preview: string
}

type DraftSnag = {
  id:           string
  description:  string
  file:         File | null
  preview:      string | null
  /** When set, this snag was auto-created from a checklist fail. */
  checklistKey?: string
}

type SnagView = {
  id:               string
  round:            number
  description:      string
  fixed:            boolean
  fixed_at:         string | null
  fixed_note:       string | null
  raised_photo_url: string | null
  fixed_photo_url:  string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyDraftSnag(partial?: Partial<DraftSnag>): DraftSnag {
  return {
    id: newId(),
    description: '',
    file: null,
    preview: null,
    ...partial,
  }
}

/** Keep checklist-driven snags in sync; preserve photos / manual snags. */
function syncSnagsFromChecklist(
  stage: QaStageKey,
  answers: QaChecklistAnswers,
  prev: DraftSnag[],
): DraftSnag[] {
  const failing = failingChecklistItems(stage, answers)
  const failingKeys = new Set(failing.map((i) => i.key))
  const manual = prev.filter((s) => !s.checklistKey)
  const keptAuto = prev.filter((s) => s.checklistKey && failingKeys.has(s.checklistKey))
  const keptKeys = new Set(keptAuto.map((s) => s.checklistKey))

  const added = failing
    .filter((item) => !keptKeys.has(item.key))
    .map((item) =>
      emptyDraftSnag({
        checklistKey: item.key,
        description: snagDescriptionFromChecklistItem(item),
      }),
    )

  const nextAuto = [
    ...keptAuto,
    ...added,
  ].sort((a, b) => {
    const ia = failing.findIndex((f) => f.key === a.checklistKey)
    const ib = failing.findIndex((f) => f.key === b.checklistKey)
    return ia - ib
  })

  const merged = [...nextAuto, ...manual]
  return merged.length > 0 ? merged : [emptyDraftSnag()]
}

function appendSnagsToFormData(fd: FormData, drafts: DraftSnag[]) {
  const photos: File[] = []
  const payload = drafts
    .map((s) => {
      const description = s.description.trim()
      if (!description) return null
      let photoIndex: number | null = null
      if (s.file) {
        photoIndex = photos.length
        photos.push(s.file)
      }
      return { description, photoIndex }
    })
    .filter(Boolean)

  fd.append('snags', JSON.stringify(payload))
  for (const file of photos) fd.append('snagPhotos', file)
}

function cellButtonClass(tone: ReturnType<typeof qaCellTone>) {
  switch (tone) {
    case 'passed':
      return 'bg-green-500 border-green-500 text-white'
    case 'failed_open':
      return 'bg-red-500 border-red-500 text-white'
    case 'awaiting_reinspection':
      return 'bg-amber-500 border-amber-500 text-white'
    default:
      return 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600'
  }
}

function cellTdClass(tone: ReturnType<typeof qaCellTone>) {
  switch (tone) {
    case 'passed':
      return 'bg-green-50'
    case 'failed_open':
      return 'bg-red-50'
    case 'awaiting_reinspection':
      return 'bg-amber-50'
    default:
      return 'bg-white'
  }
}

function SnagDraftEditor({
  snags,
  onChange,
  processing,
  error,
}: {
  snags: DraftSnag[]
  onChange: (next: DraftSnag[]) => void
  processing: boolean
  error?: string | null
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const update = (id: string, patch: Partial<DraftSnag>) => {
    onChange(snags.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const remove = (id: string) => {
    const item = snags.find((s) => s.id === id)
    if (item?.preview) URL.revokeObjectURL(item.preview)
    onChange(snags.filter((s) => s.id !== id))
  }

  const setPhoto = async (id: string, file: File | null) => {
    const current = snags.find((s) => s.id === id)
    if (current?.preview) URL.revokeObjectURL(current.preview)
    if (!file) {
      update(id, { file: null, preview: null })
      return
    }
    if (!isImageUploadFile(file)) return
    const prepared = await preparePhotoForUpload(file)
    update(id, { file: prepared, preview: URL.createObjectURL(prepared) })
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Snag list</p>
        <p className="text-xs text-slate-600 mt-0.5">
          Add each defect for the foreman. Checklist Nos create these automatically — you can add more or attach photos.
        </p>
      </div>

      {snags.map((snag, index) => (
        <div key={snag.id} className="rounded-xl border border-red-100 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">Item {index + 1}</p>
            {snags.length > 1 && (
              <button
                type="button"
                onClick={() => remove(snag.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={`Remove snag ${index + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <textarea
            value={snag.description}
            onChange={(e) => update(snag.id, { description: e.target.value })}
            rows={2}
            placeholder="Describe the defect…"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
          <input
            ref={(el) => { inputRefs.current[snag.id] = el }}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void setPhoto(snag.id, e.target.files?.[0] ?? null)
              if (e.currentTarget) e.currentTarget.value = ''
            }}
          />
          {snag.preview && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snag.preview}
                alt={`Snag ${index + 1} photo`}
                className="w-full max-h-32 object-contain rounded-lg border border-slate-200 bg-slate-50"
              />
              <button
                type="button"
                onClick={() => void setPhoto(snag.id, null)}
                className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 border border-slate-200 text-slate-600"
                aria-label="Remove snag photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={processing}
            onClick={() => inputRefs.current[snag.id]?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            {snag.file ? 'Change photo' : 'Add photo'}
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...snags, emptyDraftSnag()])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800"
      >
        <Plus className="w-3.5 h-3.5" />
        Add snag
      </button>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  )
}

function ExistingSnagsPanel({
  snags,
  loading,
  error,
}: {
  snags: SnagView[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return <p className="text-xs text-slate-500">Loading snags…</p>
  }
  if (error) {
    return <p className="text-xs text-red-600 font-medium">{error}</p>
  }
  if (snags.length === 0) {
    return <p className="text-xs text-slate-500">No snag items on this inspection.</p>
  }

  return (
    <ul className="space-y-3">
      {snags.map((snag, index) => (
        <li
          key={snag.id}
          className={`rounded-xl border p-3 space-y-2 ${
            snag.fixed
              ? 'border-amber-200 bg-amber-50/50'
              : 'border-red-200 bg-red-50/50'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Round {snag.round} · Item {index + 1}
              </p>
              <p className="text-sm text-slate-900 mt-0.5">{snag.description}</p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                snag.fixed
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {snag.fixed ? 'Fixed' : 'Open'}
            </span>
          </div>
          {(snag.raised_photo_url || snag.fixed_photo_url) && (
            <div className="grid grid-cols-2 gap-2">
              {snag.raised_photo_url && (
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">Defect</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={snag.raised_photo_url}
                    alt="Defect"
                    className="w-full h-28 object-contain rounded-lg border border-slate-200 bg-white"
                  />
                </div>
              )}
              {snag.fixed_photo_url && (
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">Fix</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={snag.fixed_photo_url}
                    alt="Fix"
                    className="w-full h-28 object-contain rounded-lg border border-slate-200 bg-white"
                  />
                </div>
              )}
            </div>
          )}
          {snag.fixed && snag.fixed_note && (
            <p className="text-xs text-slate-600">Foreman note: {snag.fixed_note}</p>
          )}
          {snag.fixed && snag.fixed_at && (
            <p className="text-[10px] text-slate-400">Marked done {fmtDate(snag.fixed_at)}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function InspectionFormModal({
  siteId,
  cell,
  inspectorDefault,
  assignedForemen,
  onClose,
  onSaved,
}: {
  siteId:           string
  cell:             OpenCell
  inspectorDefault: string
  assignedForemen:  { id: string; name: string }[]
  onClose:          () => void
  onSaved:          (grid: QaSiteGrid) => void
}) {
  const [inspectorName,  setInspectorName]  = useState(inspectorDefault)
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10))
  const [observations,   setObservations]   = useState('')
  const [result,         setResult]         = useState<'Pass' | 'Fail'>('Pass')
  const [signatureBlob,  setSignatureBlob]  = useState<Blob | null>(null)
  const [firesockPhoto,  setFiresockPhoto]  = useState<File | null>(null)
  const [firesockPreview, setFiresockPreview] = useState<string | null>(null)
  const [firesockNa,     setFiresockNa]     = useState(false)
  const [inspectionPhotos, setInspectionPhotos] = useState<PendingPhoto[]>([])
  const [draftSnags, setDraftSnags] = useState<DraftSnag[]>([emptyDraftSnag()])
  const [sigError,       setSigError]       = useState<string | null>(null)
  const [firesockError,  setFiresockError]  = useState<string | null>(null)
  const [snagError,      setSnagError]      = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [submitting,     setSubmitting]     = useState(false)
  const [confirmRemove,  setConfirmRemove]  = useState(false)
  const [removing,       setRemoving]       = useState(false)
  const [inspectionPhotoError, setInspectionPhotoError] = useState<string | null>(null)
  const [processingPhotos, setProcessingPhotos] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [showReinspectFail, setShowReinspectFail] = useState(false)

  const [existingSnags, setExistingSnags] = useState<SnagView[]>([])
  const [snagsLoading, setSnagsLoading] = useState(false)
  const [snagsLoadError, setSnagsLoadError] = useState<string | null>(null)

  const checklistItems = useMemo(() => checklistForStage(cell.stage), [cell.stage])
  const [checklist, setChecklist] = useState<QaChecklistAnswers>(() => {
    const saved = cell.existing?.form_data
      ? parseChecklistAnswers((cell.existing.form_data as { checklist?: unknown }).checklist)
      : {}
    const base = emptyChecklistAnswers(cell.stage)
    return { ...base, ...saved }
  })

  const firesockInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const atPhotoLimit = inspectionPhotos.length >= MAX_QA_INSPECTION_PHOTOS

  const needsFiresock = stageRequiresFiresock(cell.stage)
  const allowsFiresockNa = stageAllowsFiresockNa(cell.stage)
  const hasChecklist = stageHasChecklist(cell.stage)
  const firesockOk = firesockRequirementMet(cell.stage, {
    firesockNa,
    hasPhoto: !!firesockPhoto,
  })

  const completed = cell.existing?.status === 'completed'
  const inspectionState = (cell.existing?.inspection_state ?? null) as QaInspectionState | null
  const isSnagLoop =
    completed &&
    (inspectionState === 'failed_open' || inspectionState === 'awaiting_reinspection')

  const openSnagCount =
    existingSnags.length > 0
      ? existingSnags.filter((s) => !s.fixed).length
      : (cell.existing?.open_snag_count ?? 0)

  const canReinspect =
    inspectionState === 'awaiting_reinspection' ||
    (inspectionState === 'failed_open' && openSnagCount === 0)

  useEffect(() => {
    if (!isSnagLoop || !cell.existing?.id) return
    let cancelled = false
    setSnagsLoading(true)
    setSnagsLoadError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/qa/inspections/${cell.existing!.id}/snags`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not load snags.')
        if (!cancelled) setExistingSnags(json.snags ?? [])
      } catch (err) {
        if (!cancelled) {
          setSnagsLoadError(err instanceof Error ? err.message : 'Could not load snags.')
        }
      } finally {
        if (!cancelled) setSnagsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isSnagLoop, cell.existing?.id])

  const handleFiresockPhoto = async (file: File | null) => {
    if (firesockPreview) URL.revokeObjectURL(firesockPreview)
    if (!file) {
      setFiresockPhoto(null)
      setFiresockPreview(null)
      return
    }
    setFiresockError(null)
    setProcessingPhotos(true)
    try {
      const prepared = await preparePhotoForUpload(file)
      setFiresockNa(false)
      setFiresockPhoto(prepared)
      setFiresockPreview(URL.createObjectURL(prepared))
    } catch (err) {
      setFiresockError(err instanceof Error ? err.message : 'Could not use that photo.')
    } finally {
      setProcessingPhotos(false)
    }
  }

  const toggleFiresockNa = () => {
    if (firesockNa) {
      setFiresockNa(false)
      return
    }
    handleFiresockPhoto(null)
    setFiresockNa(true)
    setFiresockError(null)
  }

  const addInspectionPhotos = async (files: FileList | File[] | null) => {
    if (!files?.length) return
    const valid = Array.from(files).filter(isImageUploadFile)
    if (valid.length === 0) {
      setInspectionPhotoError('Could not use that file — please choose a photo (JPEG, PNG, or HEIC).')
      return
    }

    const remaining = MAX_QA_INSPECTION_PHOTOS - inspectionPhotos.length
    if (remaining <= 0) return

    setInspectionPhotoError(null)
    setProcessingPhotos(true)
    try {
      const batch = valid.slice(0, remaining)
      const prepared = await Promise.all(batch.map((file) => preparePhotoForUpload(file)))
      setInspectionPhotos((prev) => [
        ...prev,
        ...prepared.map((file) => ({
          id:      newId(),
          file,
          preview: URL.createObjectURL(file),
        })),
      ])
    } catch (err) {
      setInspectionPhotoError(
        err instanceof Error ? err.message : 'Could not prepare photos. Try JPEG from your gallery.',
      )
    } finally {
      setProcessingPhotos(false)
    }
  }

  const clearFileInput = (input: HTMLInputElement | null) => {
    if (input) input.value = ''
  }

  const removeInspectionPhoto = (id: string) => {
    setInspectionPhotos((prev) => {
      const item = prev.find((p) => p.id === id)
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter((p) => p.id !== id)
    })
  }

  const validDraftSnags = () =>
    draftSnags.filter((s) => s.description.trim().length > 0)

  const submit = async () => {
    setError(null)
    setSigError(null)
    setFiresockError(null)
    setChecklistError(null)
    setSnagError(null)
    if (!inspectorName.trim()) { setError('Inspector name is required.'); return }
    if (hasChecklist && !checklistAllAnswered(cell.stage, checklist)) {
      setChecklistError('Select Yes, No, or N/A for every checklist item.')
      return
    }
    if (needsFiresock && !firesockOk) {
      setFiresockError(
        allowsFiresockNa
          ? 'Upload a firesock photo or tap N/A if not required.'
          : 'Upload a firesock photo before completing this inspection.',
      )
      return
    }
    const checklistFails = failingChecklistItems(cell.stage, checklist)
    const effectiveResult: 'Pass' | 'Fail' =
      result === 'Fail' || checklistFails.length > 0 ? 'Fail' : 'Pass'
    if (effectiveResult === 'Fail' && validDraftSnags().length === 0) {
      setSnagError('Add at least one snag with a description (checklist Nos create these automatically).')
      return
    }
    if (!signatureBlob) { setSigError('Please sign the form.'); return }

    setSubmitting(true)
    try {
      const preparedInspection = await Promise.all(
        inspectionPhotos.map((p) => preparePhotoForUpload(p.file)),
      )
      const preparedFiresock = firesockPhoto
        ? await preparePhotoForUpload(firesockPhoto)
        : null

      const fd = new FormData()
      fd.append('siteId', siteId)
      fd.append('plotNumber', cell.plotNumber)
      fd.append('stage', cell.stage)
      fd.append('inspectorName', inspectorName.trim())
      fd.append('inspectionDate', inspectionDate)
      fd.append('observations', observations)
      fd.append('result', effectiveResult)
      fd.append('checklist', JSON.stringify(checklist))
      fd.append('firesockNa', firesockNa ? 'true' : 'false')
      if (preparedFiresock) fd.append('firesockPhoto', preparedFiresock)
      preparedInspection.forEach((file) => fd.append('inspectionPhotos', file))
      fd.append('signature', new File([signatureBlob], 'signature.png', { type: 'image/png' }))
      if (effectiveResult === 'Fail') appendSnagsToFormData(fd, draftSnags)

      const res  = await fetch('/api/qa/inspections', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Submission failed.')
        return
      }
      onSaved(json.grid)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const reinspectPass = async () => {
    const inspectionId = cell.existing?.id
    if (!inspectionId) return
    setError(null)
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('action', 'pass')
      const res = await fetch(`/api/qa/inspections/${inspectionId}/reinspect`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Re-inspection failed.')
        return
      }
      onSaved(json.grid)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const reinspectFail = async () => {
    const inspectionId = cell.existing?.id
    if (!inspectionId) return
    setError(null)
    setSnagError(null)
    if (validDraftSnags().length === 0) {
      setSnagError('Add at least one snag with a description.')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('action', 'fail')
      appendSnagsToFormData(fd, draftSnags)
      const res = await fetch(`/api/qa/inspections/${inspectionId}/reinspect`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Re-inspection failed.')
        return
      }
      onSaved(json.grid)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    const inspectionId = cell.existing?.id
    if (!inspectionId) return

    setError(null)
    setRemoving(true)
    try {
      const res  = await fetch(`/api/qa/inspections/${inspectionId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not remove inspection.')
        return
      }
      onSaved(json.grid)
      onClose()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setRemoving(false)
      setConfirmRemove(false)
    }
  }

  const statusBanner = (() => {
    if (!completed || !cell.existing) return null
    if (inspectionState === 'failed_open') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            With foreman
          </p>
          <p className="text-xs mt-1 text-red-800">
            {openSnagCount} open snag{openSnagCount === 1 ? '' : 's'} · waiting for fixes
          </p>
        </div>
      )
    }
    if (inspectionState === 'awaiting_reinspection') {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950">
          <p className="font-semibold flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Awaiting re-inspection
          </p>
          <p className="text-xs mt-1 text-amber-800">
            Foreman marked snags done — confirm on site.
          </p>
        </div>
      )
    }
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900">
        <p className="font-semibold">Already inspected — passed</p>
        <p className="text-xs mt-1 text-green-800">
          {cell.existing.inspector
            ? `${cell.existing.inspector.first_name} ${cell.existing.inspector.surname} · `
            : ''}
          {cell.existing.inspected_at ? fmtDate(cell.existing.inspected_at) : ''}
        </p>
      </div>
    )
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      {!isSnagLoop && (
        <>
          <input
            ref={firesockInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              handleFiresockPhoto(e.target.files?.[0] ?? null)
              clearFileInput(e.currentTarget)
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              addInspectionPhotos(e.target.files)
              clearFileInput(e.currentTarget)
            }}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              addInspectionPhotos(e.target.files)
              clearFileInput(e.currentTarget)
            }}
          />
        </>
      )}

      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
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
          {statusBanner}

          {completed && cell.existing && (
            <div className="space-y-2">
              {cell.existing.id && (
                <a
                  href={`/api/qa/inspections/${cell.existing.id}/pdf`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
              )}
              {!confirmRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove inspection
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-white border border-red-200">
                  <p className="text-xs text-red-900 font-medium">Remove this inspection? The cell will turn back to white.</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={removing}
                      onClick={remove}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      {removing ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => setConfirmRemove(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSnagLoop && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-2">Snag items</p>
                <ExistingSnagsPanel
                  snags={existingSnags}
                  loading={snagsLoading}
                  error={snagsLoadError}
                />
              </div>

              {canReinspect && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm font-semibold text-amber-950">Re-inspection</p>
                  <p className="text-xs text-amber-800">
                    Confirm on site that work is complete, or raise a new snag round.
                  </p>
                  {!showReinspectFail ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={reinspectPass}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
                      >
                        {submitting ? 'Saving…' : 'All good — pass'}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setShowReinspectFail(true)
                          setDraftSnags([emptyDraftSnag()])
                        }}
                        className="w-full py-3 bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold rounded-xl"
                      >
                        Still not right
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <SnagDraftEditor
                        snags={draftSnags}
                        onChange={setDraftSnags}
                        processing={processingPhotos}
                        error={snagError}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={reinspectFail}
                          className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
                        >
                          {submitting ? 'Saving…' : 'Fail & send to foreman'}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setShowReinspectFail(false)}
                          className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!canReinspect && inspectionState === 'failed_open' && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Waiting for the foreman to mark all snags done. The cell turns amber when ready for re-inspection.
                </p>
              )}
            </div>
          )}

          {!isSnagLoop && (
            <>
              <p className="text-xs text-slate-500 leading-relaxed">
                {completed
                  ? 'Submit again to replace this inspection record and PDF.'
                  : 'Complete the inspection checklist below. Custom stage forms can be added later — for now use observations to record findings.'}
              </p>

              {needsFiresock && (
                <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3 space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-900 block">Firesock photo</label>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {allowsFiresockNa
                        ? 'Required — upload a photo or tap N/A if not needed on this plot.'
                        : 'Required — upload a photo before completing this inspection.'}
                    </p>
                  </div>

                  {firesockPreview && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={firesockPreview}
                        alt="Firesock preview"
                        className="w-full max-h-40 object-contain rounded-lg border border-orange-200 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleFiresockPhoto(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-600 hover:bg-white"
                        aria-label="Remove firesock photo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={processingPhotos}
                      onClick={() => firesockInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-orange-300 bg-white text-sm font-semibold text-slate-800 hover:bg-orange-100 disabled:opacity-50"
                    >
                      <ImagePlus className="w-4 h-4 text-orange-600" />
                      {processingPhotos ? 'Processing…' : firesockPhoto ? 'Change photo' : 'Upload photo'}
                    </button>
                    {allowsFiresockNa && (
                      <button
                        type="button"
                        onClick={toggleFiresockNa}
                        className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                          firesockNa
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        N/A
                      </button>
                    )}
                  </div>

                  {firesockNa && (
                    <p className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      Firesock marked N/A — not required on this plot.
                    </p>
                  )}

                  {firesockError && (
                    <p className="text-xs text-red-600 font-medium">{firesockError}</p>
                  )}
                </div>
              )}

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

              {hasChecklist && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Inspection checklist</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Select Yes, No, or N/A. A failing answer automatically creates a snag for the site foreman.
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {checklistItems.map((item) => {
                      const selected = checklist[item.key]
                      const failOn = item.failValue ?? 'no'
                      return (
                        <li key={item.key} className="border-b border-slate-200/80 pb-3 last:border-0 last:pb-0">
                          <p className="text-sm text-slate-800 leading-snug">{item.label}</p>
                          <div className="flex gap-1.5 mt-2">
                            {(['yes', 'no', 'na'] as const).map((value) => {
                              const label = value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'N/A'
                              const active = selected === value
                              const isFailAnswer = value === failOn
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    setChecklist((prev) => {
                                      const next = { ...prev, [item.key]: value as QaChecklistValue }
                                      setDraftSnags((snags) =>
                                        syncSnagsFromChecklist(cell.stage, next, snags),
                                      )
                                      if (failingChecklistItems(cell.stage, next).length > 0) {
                                        setResult('Fail')
                                      }
                                      return next
                                    })
                                    setChecklistError(null)
                                    setSnagError(null)
                                  }}
                                  className={`flex-1 py-2 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                                    active
                                      ? isFailAnswer
                                        ? 'bg-red-600 border-red-600 text-white'
                                        : value === 'yes'
                                          ? 'bg-green-600 border-green-600 text-white'
                                          : 'bg-slate-700 border-slate-700 text-white'
                                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {checklistError && (
                    <p className="text-xs text-red-600 font-medium">{checklistError}</p>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Result</label>
                <select
                  value={result}
                  onChange={(e) => {
                    const next = e.target.value as 'Pass' | 'Fail'
                    if (
                      next === 'Pass' &&
                      failingChecklistItems(cell.stage, checklist).length > 0
                    ) {
                      setSnagError('Clear failing checklist answers before marking Pass.')
                      return
                    }
                    setResult(next)
                    setSnagError(null)
                    if (next === 'Fail' && validDraftSnags().length === 0) {
                      setDraftSnags([emptyDraftSnag()])
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail — send snags to foreman</option>
                </select>
                {result === 'Fail' && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {assignedForemen.length > 0
                      ? `Goes to: ${assignedForemen.map((f) => f.name).join(', ')}`
                      : 'No foreman assigned to this site yet — assign one under Sites so they get the snag list.'}
                  </p>
                )}
              </div>

              {result === 'Fail' && (
                <SnagDraftEditor
                  snags={draftSnags}
                  onChange={setDraftSnags}
                  processing={processingPhotos}
                  error={snagError}
                />
              )}

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

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div>
                  <label className="text-sm font-semibold text-slate-900 block">Inspection photos</label>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Optional — take or upload multiple photos during the inspection. All photos appear at the bottom of the PDF after your signature.
                  </p>
                </div>

                {inspectionPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {inspectionPhotos.map((photo, index) => (
                      <div key={photo.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.preview}
                          alt={`Inspection photo ${index + 1}`}
                          className="w-full h-32 object-contain rounded-lg border border-slate-200 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeInspectionPhoto(photo.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 border border-slate-200 text-slate-600 hover:bg-white"
                          aria-label={`Remove inspection photo ${index + 1}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={atPhotoLimit || processingPhotos}
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Camera className="w-4 h-4 text-slate-700" />
                    {processingPhotos ? 'Processing…' : 'Take photo'}
                  </button>
                  <button
                    type="button"
                    disabled={atPhotoLimit || processingPhotos}
                    onClick={() => uploadInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <ImagePlus className="w-4 h-4 text-slate-700" />
                    Upload photos
                  </button>
                </div>

                {inspectionPhotoError && (
                  <p className="text-xs text-red-600 font-medium">{inspectionPhotoError}</p>
                )}

                <p className="text-[11px] text-slate-500">
                  {inspectionPhotos.length} / {MAX_QA_INSPECTION_PHOTOS} photos added
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-2 block">Signature</label>
                <SignaturePad
                  onSigned={setSignatureBlob}
                  onCleared={() => setSignatureBlob(null)}
                  error={sigError ?? undefined}
                />
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {submitting
                  ? 'Saving…'
                  : result === 'Fail' || failingChecklistItems(cell.stage, checklist).length > 0
                    ? 'Fail & send snags to foreman'
                    : completed
                      ? 'Replace inspection & save PDF'
                      : 'Pass & save PDF'}
              </button>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function QaInspectionGrid({
  initialGrid,
  inspectorDefault,
  assignedForemen = [],
}: Props) {
  const [grid, setGrid] = useState(initialGrid)
  const [openCell, setOpenCell] = useState<OpenCell | null>(null)
  const [, startTransition] = useTransition()

  const { passed, failed_open, awaiting_reinspection, not_inspected } = grid.summary
  const totalSlots = passed + failed_open + awaiting_reinspection + not_inspected
  const inspected = passed + failed_open + awaiting_reinspection
  const pct = totalSlots ? Math.round((passed / totalSlots) * 100) : 0

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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{grid.site_name}</p>
          <p className="text-xs text-slate-500">{inspected} / {totalSlots} inspected</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
          {passed > 0 && (
            <div className="h-full bg-green-500" style={{ width: `${(passed / totalSlots) * 100}%` }} />
          )}
          {failed_open > 0 && (
            <div className="h-full bg-red-500" style={{ width: `${(failed_open / totalSlots) * 100}%` }} />
          )}
          {awaiting_reinspection > 0 && (
            <div className="h-full bg-amber-500" style={{ width: `${(awaiting_reinspection / totalSlots) * 100}%` }} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium">
          <span className="text-green-700">{passed} passed</span>
          <span className="text-red-700">{failed_open} with foreman</span>
          <span className="text-amber-700">{awaiting_reinspection} awaiting re-inspection</span>
          <span className="text-slate-400">{not_inspected} not inspected · {pct}% passed</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Tap a stage cell to inspect. Green = passed, red = with foreman, amber = ready for re-inspection.
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
                    const tone = record?.status === 'completed'
                      ? qaCellTone(record.inspection_state)
                      : 'none'
                    const titleState = tone === 'none'
                      ? 'Not inspected'
                      : qaStateLabel(record!.inspection_state)
                    return (
                      <td key={s.key} className={`px-2 py-2 text-center ${cellTdClass(tone)}`}>
                        <button
                          type="button"
                          onClick={() => setOpenCell({
                            plotNumber: plot.plot_number,
                            stage:      s.key,
                            existing:   record,
                          })}
                          className={`w-9 h-9 mx-auto rounded-lg flex items-center justify-center transition-colors border ${cellButtonClass(tone)}`}
                          title={`${plot.plot_number} — ${s.label} (${titleState})`}
                        >
                          {tone === 'passed' && <Check className="w-4 h-4" />}
                          {tone === 'failed_open' && <AlertCircle className="w-4 h-4" />}
                          {tone === 'awaiting_reinspection' && <Clock className="w-4 h-4" />}
                          {tone === 'none' && <span className="w-3 h-3 rounded-sm border-2 border-current" />}
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
          assignedForemen={assignedForemen}
          onClose={() => setOpenCell(null)}
          onSaved={(updated) => startTransition(() => setGrid(updated))}
        />
      )}
    </div>
  )
}

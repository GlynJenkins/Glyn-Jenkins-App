'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  Camera, CheckCircle, AlertCircle, Loader2,
  ArrowRight, Plus, Trash2, FileText
} from 'lucide-react'
import PortalHeader from '@/components/PortalHeader'

type Worker = { id: string; first_name: string; surname: string; role: string }
type Site   = { id: string; name: string }

type WorkerLine = { lineId: string; workerId: string; hours: string }

const RATES: Record<string, number> = {
  bricklayer: 30,
  labourer:   15,
  apprentice: 10,
}
const ROLE_LABELS: Record<string, string> = {
  bricklayer: 'Bricklayer',
  labourer:   'Labourer',
  apprentice: 'Apprentice',
}

let lineCounter = 1
const newLine = (): WorkerLine => ({ lineId: `line-${lineCounter++}`, workerId: '', hours: '' })

interface Props {
  site:      Site
  foremanId: string
  workers:   Worker[]
}

export default function VariationForm({ site, foremanId, workers }: Props) {
  const [lines,       setLines]       = useState<WorkerLine[]>([newLine()])
  const [description, setDescription] = useState('')
  const [photo,       setPhoto]       = useState<File | null>(null)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const addLine  = () => setLines((prev) => [...prev, newLine()])
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.lineId !== id))
  const updateLine = (id: string, field: 'workerId' | 'hours', value: string) =>
    setLines((prev) => prev.map((l) => l.lineId === id ? { ...l, [field]: value } : l))

  // Grand total
  const grandTotal = lines.reduce((sum, line) => {
    const worker = workers.find((w) => w.id === line.workerId)
    const rate   = worker ? (RATES[worker.role] ?? 0) : 0
    return sum + rate * (parseFloat(line.hours) || 0)
  }, 0)

  const validate = () => {
    const e: Record<string, string> = {}
    lines.forEach((line, i) => {
      if (!line.workerId)               e[`worker-${i}`] = 'Select a worker'
      const h = parseFloat(line.hours)
      if (isNaN(h) || h <= 0)          e[`hours-${i}`]  = 'Enter valid hours'
    })
    if (!description.trim())           e.description    = 'Description is required'
    if (!photo)                        e.photo          = 'A photo is required as proof'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    setServerError(null)

    try {
      const workerEntries = lines.map((line) => {
        const worker = workers.find((w) => w.id === line.workerId)!
        return { workerId: line.workerId, workerRole: worker.role, hours: parseFloat(line.hours) }
      })

      const fd = new FormData()
      fd.append('siteId',      site.id)
      fd.append('foremanId',   foremanId)
      fd.append('description', description)
      fd.append('photo',       photo!)
      fd.append('workers',     JSON.stringify(workerEntries))

      const res  = await fetch('/api/variations', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Submission failed')
      setSubmitted(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = (hasErr: boolean) =>
    `w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent ${
      hasErr ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
    }`

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Variation Submitted</h1>
        <p className="text-slate-500 text-sm max-w-xs">
          Your daywork sheet has been sent to the admin for approval.
        </p>
        <Link href="/foreman" className="mt-8 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <Link href="/foreman" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
          ← My Sites
        </Link>
        <h1 className="text-xl font-bold text-white mt-1">Submit Variation / Daywork</h1>
        <p className="text-slate-400 text-sm">{site.name}</p>
      </PortalHeader>

      <div className="px-4 pt-5 pb-36 space-y-5 max-w-lg mx-auto">

        {/* Worker lines */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-semibold text-slate-800">Workers &amp; Hours</h2>

          {lines.map((line, i) => {
            const selectedWorker = workers.find((w) => w.id === line.workerId)
            const rate           = selectedWorker ? (RATES[selectedWorker.role] ?? 0) : 0
            const lineTotal      = rate * (parseFloat(line.hours) || 0)

            return (
              <div key={line.lineId} className="space-y-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Worker {i + 1}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.lineId)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <select
                    value={line.workerId}
                    onChange={(e) => updateLine(line.lineId, 'workerId', e.target.value)}
                    className={inputCls(!!errors[`worker-${i}`])}
                  >
                    <option value="">Select worker...</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.first_name} {w.surname} — {ROLE_LABELS[w.role]} (£{RATES[w.role]}/hr)
                      </option>
                    ))}
                  </select>
                  {errors[`worker-${i}`] && (
                    <p className="text-xs text-red-500 mt-1">{errors[`worker-${i}`]}</p>
                  )}
                </div>

                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={line.hours}
                      onChange={(e) => updateLine(line.lineId, 'hours', e.target.value)}
                      placeholder="Hours e.g. 4.5"
                      className={inputCls(!!errors[`hours-${i}`])}
                    />
                    {errors[`hours-${i}`] && (
                      <p className="text-xs text-red-500 mt-1">{errors[`hours-${i}`]}</p>
                    )}
                  </div>
                  {lineTotal > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-right shrink-0">
                      <p className="text-xs text-orange-500">Line total</p>
                      <p className="font-bold text-orange-700">
                        £{lineTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={addLine}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-orange-300 text-orange-600 font-medium text-sm rounded-xl hover:bg-orange-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Another Worker
          </button>

          {/* Grand total */}
          {grandTotal > 0 && (
            <div className="flex items-center justify-between p-4 bg-slate-900 rounded-xl mt-2">
              <span className="text-slate-400 text-sm font-medium">Grand Total</span>
              <span className="text-2xl font-bold text-orange-400">
                £{grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {/* Description + Photo */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="font-semibold text-slate-800">Description &amp; Photo Proof</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description of Works <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Extra brickwork to gable end on Plot 12 — unscheduled elevation change"
              rows={3}
              className={inputCls(!!errors.description)}
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Photo Proof <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all ${
                photo ? 'border-green-400 bg-green-50' : errors.photo ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {photo
                ? <><CheckCircle className="w-5 h-5 text-green-500 shrink-0" /><span className="text-sm text-green-700 truncate">{photo.name}</span></>
                : <><Camera className="w-5 h-5 text-gray-400 shrink-0" /><span className="text-sm text-gray-500">Tap to take photo of the works</span></>
              }
            </button>
            {errors.photo && <p className="text-xs text-red-500 mt-1">{errors.photo}</p>}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        {serverError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-xl px-4 py-4 safe-bottom-bar">
        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 bg-orange-600
                     hover:bg-orange-700 disabled:bg-orange-300 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          {submitting
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
            : <>Submit for Admin Approval <ArrowRight className="w-5 h-5" /></>
          }
        </button>
      </div>
    </div>
  )
}

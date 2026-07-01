'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { VARIATION_RATES, ROLE_LABELS } from '@/lib/variations/rates'

type SiteOption = { id: string; name: string }
type ForemanOption = { id: string; first_name: string; surname: string }
type WorkerOption = { id: string; first_name: string; surname: string; role: string }
type SiteForemanAssignment = { site_id: string; foreman_id: string }

type WorkerLine = { lineId: string; workerId: string; hours: string }

let lineCounter = 1
const newLine = (): WorkerLine => ({ lineId: `line-${lineCounter++}`, workerId: '', hours: '' })

type PayType = 'lump_sum' | 'daywork'

export default function NewAdminVariationForm({
  sites,
  foremen,
  workers,
  siteForemanAssignments,
}: {
  sites: SiteOption[]
  foremen: ForemanOption[]
  workers: WorkerOption[]
  siteForemanAssignments: SiteForemanAssignment[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [description, setDescription] = useState('')
  const [assignedForemanId, setAssignedForemanId] = useState('none')
  const [payType, setPayType] = useState<PayType>('lump_sum')
  const [lumpSumAmount, setLumpSumAmount] = useState('')
  const [lines, setLines] = useState<WorkerLine[]>([newLine()])
  const [photo, setPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const siteForemen = useMemo(() => {
    if (!siteId) return foremen
    const ids = new Set(
      siteForemanAssignments.filter((a) => a.site_id === siteId).map((a) => a.foreman_id)
    )
    return foremen.filter((f) => ids.has(f.id))
  }, [siteId, foremen, siteForemanAssignments])

  const dayworkTotal = useMemo(() => lines.reduce((sum, line) => {
    const worker = workers.find((w) => w.id === line.workerId)
    const rate = worker ? (VARIATION_RATES[worker.role as keyof typeof VARIATION_RATES] ?? 0) : 0
    return sum + rate * (parseFloat(line.hours) || 0)
  }, 0), [lines, workers])

  const resetForm = () => {
    setSiteId('')
    setDescription('')
    setAssignedForemanId('none')
    setPayType('lump_sum')
    setLumpSumAmount('')
    setLines([newLine()])
    setPhoto(null)
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    setSuccess(false)

    if (!siteId) { setError('Select a site.'); return }
    if (!description.trim()) { setError('Description is required.'); return }

    if (payType === 'lump_sum') {
      const amount = parseFloat(lumpSumAmount)
      if (isNaN(amount) || amount <= 0) { setError('Enter a valid lump sum amount.'); return }
    } else {
      for (const line of lines) {
        if (!line.workerId) { setError('Select a worker for each line.'); return }
        const h = parseFloat(line.hours)
        if (isNaN(h) || h <= 0) { setError('Enter valid hours for each worker.'); return }
      }
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('siteId', siteId)
      fd.set('description', description.trim())
      fd.set('assignedForemanId', assignedForemanId)
      fd.set('payType', payType)
      if (payType === 'lump_sum') {
        fd.set('lumpSumAmount', lumpSumAmount)
        fd.set('workers', '[]')
      } else {
        fd.set('workers', JSON.stringify(lines.map((line) => {
          const worker = workers.find((w) => w.id === line.workerId)!
          return {
            workerId:   line.workerId,
            workerRole: worker.role,
            hours:      parseFloat(line.hours),
          }
        })))
      }
      if (photo) fd.set('photo', photo)

      const res = await fetch('/api/admin/variations/create', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not create variation.')

      setSuccess(true)
      resetForm()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create variation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <p className="font-semibold text-slate-900 text-sm">Create variation</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin / management — auto-approved · optional foreman assignment
          </p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
          {success && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
              Variation created and approved.
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Site</span>
            <select
              value={siteId}
              onChange={(e) => { setSiteId(e.target.value); setAssignedForemanId('none') }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">Select site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Reason for VO</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe the variation work…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Assign to foreman</span>
            <select
              value={assignedForemanId}
              onChange={(e) => setAssignedForemanId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="none">Unassigned</option>
              {siteForemen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.first_name} {f.surname}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              Assigned foremen can include this in their wage claim once approved.
            </p>
          </label>

          <div>
            <span className="text-xs font-medium text-slate-600 mb-2 block">Foreman pay</span>
            <div className="flex bg-gray-100 rounded-xl p-1">
              {(['lump_sum', 'daywork'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPayType(type)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    payType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {type === 'lump_sum' ? 'Lump sum' : 'Daywork'}
                </button>
              ))}
            </div>
          </div>

          {payType === 'lump_sum' ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600 mb-1 block">Lump sum (£)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lumpSumAmount}
                onChange={(e) => setLumpSumAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </label>
          ) : (
            <div className="space-y-2">
              {lines.map((line, i) => {
                const worker = workers.find((w) => w.id === line.workerId)
                const rate = worker ? (VARIATION_RATES[worker.role as keyof typeof VARIATION_RATES] ?? 0) : 0
                const lineTotal = rate * (parseFloat(line.hours) || 0)
                return (
                  <div key={line.lineId} className="flex gap-2 items-start">
                    <select
                      value={line.workerId}
                      onChange={(e) => setLines((prev) => prev.map((l) =>
                        l.lineId === line.lineId ? { ...l, workerId: e.target.value } : l
                      ))}
                      className="flex-1 px-2 py-2 border border-gray-200 rounded-xl text-sm bg-white min-w-0"
                    >
                      <option value="">Worker…</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.first_name} {w.surname} ({ROLE_LABELS[w.role] ?? w.role})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={line.hours}
                      onChange={(e) => setLines((prev) => prev.map((l) =>
                        l.lineId === line.lineId ? { ...l, hours: e.target.value } : l
                      ))}
                      placeholder="Hrs"
                      className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((l) => l.lineId !== line.lineId))}
                        className="p-2 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {lineTotal > 0 && (
                      <span className="text-xs text-slate-500 self-center tabular-nums">
                        £{lineTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="flex items-center gap-1 text-xs font-medium text-orange-600"
              >
                <Plus className="w-3.5 h-3.5" /> Add worker
              </button>
              {dayworkTotal > 0 && (
                <p className="text-sm font-semibold text-orange-600">
                  Total: £{dayworkTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600 mb-1 block">Photo (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-500"
            />
          </label>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create &amp; approve variation
          </button>
        </div>
      )}
    </div>
  )
}

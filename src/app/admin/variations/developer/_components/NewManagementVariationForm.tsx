'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react'
import { MATERIAL_UPLIFT_PERCENT } from '@/lib/variations/rates'

type SiteOption = { id: string; name: string }
type ForemanOption = { id: string; first_name: string; surname: string }

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

export default function NewManagementVariationForm({
  sites,
  foremen,
}: {
  sites: SiteOption[]
  foremen: ForemanOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [plotNumbers, setPlotNumbers] = useState('')
  const [claimMode, setClaimMode] = useState<'foreman_payable' | 'company_profit'>('foreman_payable')
  const [foremanLumpSum, setForemanLumpSum] = useState('')
  const [assignedForemanId, setAssignedForemanId] = useState('')
  const [developerTotal, setDeveloperTotal] = useState('')
  const [materialUplift, setMaterialUplift] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])

  const devSubtotal = parseFloat(developerTotal) || 0
  const uplift = materialUplift ? Math.round(devSubtotal * MATERIAL_UPLIFT_PERCENT) / 100 : 0
  const devCharge = Math.round((devSubtotal + uplift) * 100) / 100
  const foremanPay = parseFloat(foremanLumpSum) || 0
  const profit = devCharge - (claimMode === 'foreman_payable' ? foremanPay : 0)
  const payMismatch = claimMode === 'foreman_payable' && foremanPay > 0 && Math.abs(foremanPay - devCharge) < 0.005
  const payExceedsDev = claimMode === 'foreman_payable' && foremanPay > devCharge

  const submit = () => {
    if (payMismatch) {
      setError('Foreman pay must be different from the developer charge.')
      return
    }
    if (payExceedsDev) {
      setError('Foreman pay cannot exceed the developer charge.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('siteId', siteId)
        formData.set('description', description)
        formData.set('plotNumbers', plotNumbers)
        formData.set('claimMode', claimMode)
        if (claimMode === 'foreman_payable') {
          formData.set('foremanLumpSum', foremanLumpSum)
          if (assignedForemanId) formData.set('assignedForemanId', assignedForemanId)
        }
        formData.set('developerTotal', developerTotal)
        formData.set('materialUplift', materialUplift ? 'true' : 'false')
        for (const file of photos) formData.append('photos', file)

        const res = await fetch('/api/admin/variations/developer/management/create', {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not create variation.')

        router.push(`/admin/variations/developer/${json.developerSubmissionId}`)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create variation.')
      }
    })
  }

  if (sites.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">New management variation</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Office-created VO — lump sum to foreman or company profit. Photos optional.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Plot 56 door change"
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Plot numbers</span>
            <span className="block text-xs text-slate-500 mt-0.5">Comma or line separated — shown on foreman claim</span>
            <input
              type="text"
              value={plotNumbers}
              onChange={(e) => setPlotNumbers(e.target.value)}
              placeholder="12, 14, 15A"
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Foreman pay</legend>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="claimMode"
                checked={claimMode === 'foreman_payable'}
                onChange={() => setClaimMode('foreman_payable')}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-800">Foreman pay (lump sum)</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  What the foreman is paid — must be less than the developer charge. Assign to a foreman or leave open for any foreman on site.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="claimMode"
                checked={claimMode === 'company_profit'}
                onChange={() => setClaimMode('company_profit')}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-800">Company profit only</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Full developer charge is margin — no foreman pay line.
                </span>
              </span>
            </label>
          </fieldset>

          {claimMode === 'foreman_payable' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm col-span-2 sm:col-span-1">
                <span className="text-slate-700 font-medium">Foreman pay (£)</span>
                <span className="block text-xs text-slate-500">Internal — not shown to developer</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={foremanLumpSum}
                  onChange={(e) => setForemanLumpSum(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                />
              </label>
              <label className="block text-sm col-span-2 sm:col-span-1">
                <span className="text-slate-700 font-medium">Assign to foreman (optional)</span>
                <select
                  value={assignedForemanId}
                  onChange={(e) => setAssignedForemanId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                >
                  <option value="">Any foreman on site</option>
                  {foremen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.first_name} {f.surname}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Developer charge — labour (£)</span>
            <span className="block text-xs text-slate-500">What you submit to the developer on the VO</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={developerTotal}
              onChange={(e) => setDeveloperTotal(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={materialUplift}
              onChange={(e) => setMaterialUplift(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span className="text-sm text-slate-700">
              Include {MATERIAL_UPLIFT_PERCENT}% material uplift on developer total
            </span>
          </label>

          {devSubtotal > 0 && (
            <div className="text-sm space-y-1 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <div className="flex justify-between text-slate-600">
                <span>Developer total</span>
                <span className="font-semibold text-orange-600">{fmt(devCharge)}</span>
              </div>
              {claimMode === 'foreman_payable' && foremanPay > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>Foreman pay</span>
                    <span>{fmt(foremanPay)}</span>
                  </div>
                  {(payMismatch || payExceedsDev) && (
                    <p className="text-xs text-red-600">
                      {payExceedsDev
                        ? 'Foreman pay cannot exceed the developer charge.'
                        : 'Foreman pay must differ from the developer charge.'}
                    </p>
                  )}
                  <div className="flex justify-between font-semibold text-emerald-800 pt-1 border-t border-emerald-100">
                    <span>Profit</span>
                    <span>{fmt(profit)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Photos (optional)</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
              className="mt-1 w-full text-sm text-slate-600"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="button"
            disabled={busy || !siteId || !description.trim() || devSubtotal <= 0 || payMismatch || payExceedsDev || (claimMode === 'foreman_payable' && foremanPay <= 0)}
            onClick={submit}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create variation
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown, ChevronUp, Loader2, Send, CheckCircle, XCircle, ExternalLink, Lock, Trash2, Plus, Download, PenLine,
} from 'lucide-react'
import { computeDeveloperTotals, lineTotal } from '@/lib/variations/developer'
import {
  DEVELOPER_ROLES, MATERIAL_UPLIFT_PERCENT, ROLE_LABELS, VARIATION_RATES,
} from '@/lib/variations/rates'

type Line = {
  id: string
  hours: number
  rate_per_hour: number
  total_amount: number | null
  worker_role: string | null
  developer_hours: number | null
  developer_rate_per_hour: number | null
  is_lump_sum?: boolean
  lump_sum_label?: string | null
  description?: string
  workers: { first_name: string; surname: string; role: string } | null
}

type ExtraLine = {
  id: string
  worker_role: string
  developer_hours: number
  developer_rate_per_hour: number
}

type Submission = {
  id: string
  reference: string
  description: string
  status: string
  payment_status: string
  foreman_total: number
  developer_total: number
  material_uplift_enabled: boolean
  submitted_to_developer_at: string | null
  paid_at: string | null
  site_agent_name: string | null
  site_agent_signed_at: string | null
  siteAgentSigned: boolean
  signOffReady?: boolean
  signOffBlockReason?: string | null
  photo_urls: string[]
  signedPhotoUrls: string[]
  source?: string
  claim_mode?: string
  plot_numbers?: string[]
  foreman_lump_sum?: number | null
  sites: { id: string; name: string; site_code: string | null } | null
  foremen: { first_name: string; surname: string } | null
  lines: Line[]
  extraLines: ExtraLine[]
}

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function lineRoleLabel(line: Line) {
  const role = line.worker_role ?? line.workers?.role ?? ''
  return (ROLE_LABELS[role] ?? role) || 'Worker'
}

function LineEditor({
  hours,
  rate,
  isDraft,
  onHours,
  onRate,
}: {
  hours: number
  rate: number
  isDraft: boolean
  onHours: (v: number) => void
  onRate: (v: number) => void
}) {
  if (!isDraft) {
    return (
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{hours}hrs @ {fmt(rate)}/hr</span>
        <span className="font-semibold">{fmt(lineTotal(hours, rate))}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <label className="flex-1 text-xs">
        <span className="text-slate-500">Hours</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={hours}
          onChange={(e) => onHours(parseFloat(e.target.value) || 0)}
          className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>
      <label className="flex-1 text-xs">
        <span className="text-slate-500">Rate (£/hr)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={rate}
          onChange={(e) => onRate(parseFloat(e.target.value) || 0)}
          className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>
      <div className="text-right pt-5 shrink-0">
        <p className="text-xs text-slate-500">Line total</p>
        <p className="font-semibold text-sm">{fmt(lineTotal(hours, rate))}</p>
      </div>
    </div>
  )
}

export default function DeveloperSubmissionEditor({ submission }: { submission: Submission }) {
  const router = useRouter()
  const [foremanOpen, setForemanOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const isDraft = submission.status === 'draft'
  const isAwaitingAgreement = submission.status === 'submitted'
  const isAgreed = submission.status === 'agreed'
  const isPaid = submission.status === 'paid' || submission.payment_status === 'paid'
  const isEditable = isDraft || isAwaitingAgreement
  const isLocked = !isEditable
  const isManagement = submission.source === 'management'
  const isCompanyProfit = submission.claim_mode === 'company_profit'

  const [lines, setLines] = useState(
    submission.lines.map((l) => ({
      id: l.id,
      developer_hours: l.developer_hours ?? l.hours,
      developer_rate_per_hour: l.developer_rate_per_hour ?? l.rate_per_hour,
    }))
  )

  const [extraLines, setExtraLines] = useState(
    (submission.extraLines ?? []).map((l) => ({
      id: l.id,
      worker_role: l.worker_role,
      developer_hours: l.developer_hours,
      developer_rate_per_hour: l.developer_rate_per_hour,
    }))
  )

  const [materialUpliftEnabled, setMaterialUpliftEnabled] = useState(
    submission.material_uplift_enabled ?? false
  )

  const totals = computeDeveloperTotals(lines, extraLines, materialUpliftEnabled)
  const displayDeveloperTotal = isManagement
    ? submission.developer_total
    : totals.developerTotal

  const foremanTotal = isManagement
    ? (submission.foreman_lump_sum ?? submission.foreman_total ?? 0)
    : submission.lines.reduce(
        (sum, l) => sum + (l.total_amount ?? lineTotal(l.hours, l.rate_per_hour)),
        0
      )

  const buildPayload = () => ({
    lines,
    extraLines: extraLines.map(({ id, worker_role, developer_hours, developer_rate_per_hour }) => ({
      id,
      worker_role,
      developer_hours,
      developer_rate_per_hour,
    })),
    material_uplift_enabled: materialUpliftEnabled,
  })

  const pdfUrl = `/api/admin/variations/developer/${submission.id}/pdf`

  const downloadPdf = () => {
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  const savePayload = async () => {
    const res = await fetch(`/api/admin/variations/developer/${submission.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPayload()),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Save failed.')
    return json
  }

  const saveDraft = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        await savePayload()
        setMessage('Developer figures saved.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed.')
      }
    })
  }

  const submitToDeveloper = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        if (!isManagement) await savePayload()
        const res = await fetch(`/api/admin/variations/developer/${submission.id}/submit`, {
          method: 'POST',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Submit failed.')
        setMessage('Marked as sent — download the PDF below to email or share with the developer.')
        downloadPdf()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed.')
      }
    })
  }

  const markAgreed = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/variations/developer/${submission.id}/agree`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Update failed.'); return }
      setMessage(isCompanyProfit
        ? 'Developer agreed — no foreman pay on this variation. Capture site sign-off when work is done.'
        : 'Developer agreed — you can now approve the foreman lump sum on the Pending tab.')
      router.refresh()
    })
  }

  const deleteDraft = () => {
    if (!confirm('Delete this developer draft? The foreman variation stays pending and can be approved without charging the developer.')) {
      return
    }
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/variations/developer/${submission.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Delete failed.'); return }
      router.push('/admin/variations')
      router.refresh()
    })
  }

  const setPayment = (payment_status: 'paid' | 'unpaid') => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/variations/developer/${submission.id}/payment`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payment_status }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Update failed.'); return }
      setMessage(payment_status === 'paid' ? 'Marked as paid.' : 'Marked as unpaid.')
      router.refresh()
    })
  }

  const addExtraLine = () => {
    setExtraLines((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}-${prev.length}`,
        worker_role: 'labourer',
        developer_hours: 0,
        developer_rate_per_hour: VARIATION_RATES.labourer,
      },
    ])
  }

  const removeExtraLine = (id: string) => {
    setExtraLines((prev) => prev.filter((l) => l.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 space-y-2 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-orange-600">{submission.reference}</p>
              {isManagement ? (
                <>
                  <p className="font-semibold text-slate-900">Management variation</p>
                  <p className="text-xs text-slate-500">
                    {isCompanyProfit
                      ? 'Company profit — no foreman pay'
                      : submission.foremen
                        ? `Foreman: ${submission.foremen.first_name} ${submission.foremen.surname}`
                        : 'Any foreman on site can claim'}
                  </p>
                </>
              ) : (
                <p className="font-semibold text-slate-900">
                  {submission.foremen?.first_name} {submission.foremen?.surname}
                </p>
              )}
              {submission.sites?.id ? (
                <Link
                  href={`/admin/variations/developer/sites/${submission.sites.id}`}
                  className="text-xs text-slate-500 hover:text-orange-600"
                >
                  {submission.sites.name}
                </Link>
              ) : (
                <p className="text-xs text-slate-500">{submission.sites?.name}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                isPaid ? 'bg-green-100 text-green-700'
                  : isAgreed ? 'bg-emerald-100 text-emerald-700'
                  : isAwaitingAgreement ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {isPaid ? 'Paid' : isAgreed ? 'Agreed' : isAwaitingAgreement ? 'Awaiting agreement' : 'Draft'}
              </span>
              {(isAgreed || isAwaitingAgreement) && !isPaid && (
                <span className="text-xs text-amber-600 font-medium">Unpaid</span>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-700 bg-gray-50 rounded-xl p-3">{submission.description}</p>
          {isManagement && (submission.plot_numbers?.length ?? 0) > 0 && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
              Plots: {submission.plot_numbers!.join(', ')}
            </p>
          )}
          {submission.signedPhotoUrls[0] && (
            <a
              href={submission.signedPhotoUrls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View photo
            </a>
          )}

          {submission.siteAgentSigned ? (
            <div className="flex items-start gap-2 text-xs text-green-800 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Site agent signed off</p>
                <p className="mt-0.5">
                  {submission.site_agent_name}
                  {submission.site_agent_signed_at
                    ? ` · ${new Date(submission.site_agent_signed_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}`
                    : ''}
                </p>
              </div>
            </div>
          ) : submission.sites?.id && !isPaid && isAgreed && submission.signOffReady ? (
            <div className="flex items-start gap-2 text-xs text-orange-800 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
              <PenLine className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ready for site agent sign-off</p>
                <p className="mt-0.5 leading-relaxed">
                  Once work is complete, open{' '}
                  <Link href={`/admin/variations/sign-off/${submission.sites.id}`} className="font-semibold underline">
                    Site agent sign-off
                  </Link>
                  {' '}on site (management). Required before marking paid.
                </p>
              </div>
            </div>
          ) : submission.sites?.id && !isPaid && isAgreed && submission.signOffBlockReason ? (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <PenLine className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sign-off not ready yet</p>
                <p className="mt-0.5 leading-relaxed">{submission.signOffBlockReason}</p>
                {submission.signOffBlockReason.includes('foreman') && (
                  <Link href="/admin/variations" className="font-semibold underline mt-1 inline-block">
                    Open Pending tab to approve foreman pay →
                  </Link>
                )}
              </div>
            </div>
          ) : submission.sites?.id && !isPaid && isAwaitingAgreement ? (
            <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <PenLine className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Awaiting developer agreement</p>
                <p className="mt-0.5 leading-relaxed">
                  Mark developer agreed after they accept the cost. Sign-off comes after that.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Developer variation</h2>
            {isLocked && <Lock className="w-4 h-4 text-slate-400" />}
          </div>
          <p className="text-xs text-slate-500">
            {isManagement
              ? 'Office-created variation — developer charge set at creation. Send for agreement when ready.'
              : 'Trade roles only — no worker names. Add extra lines or a 10% material uplift before the developer agrees.'}
          </p>
          {isAwaitingAgreement && !isManagement && (
            <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              Sent to developer — you can still add workers or toggle material uplift until you mark developer agreed.
            </p>
          )}

          {isManagement ? (
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Developer charge</span>
                <span className="font-bold text-orange-600">{fmt(displayDeveloperTotal)}</span>
              </div>
              {materialUpliftEnabled && (
                <p className="text-xs text-slate-500">
                  Includes {MATERIAL_UPLIFT_PERCENT}% material uplift
                </p>
              )}
              {!isCompanyProfit && (
                <div className="flex justify-between text-slate-600 pt-2 border-t border-gray-200">
                  <span>Foreman pay</span>
                  <span>{fmt(foremanTotal)}</span>
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {submission.lines.map((line, index) => {
              const edit = lines[index]
              return (
                <div key={line.id} className="px-4 py-3 space-y-2">
                  <p className="text-sm font-medium text-slate-800">
                    {lineRoleLabel(line)}
                  </p>
                  <LineEditor
                    hours={edit.developer_hours}
                    rate={edit.developer_rate_per_hour}
                    isDraft={isEditable}
                    onHours={(val) => setLines((prev) => prev.map((l, i) =>
                      i === index ? { ...l, developer_hours: val } : l))}
                    onRate={(val) => setLines((prev) => prev.map((l, i) =>
                      i === index ? { ...l, developer_rate_per_hour: val } : l))}
                  />
                </div>
              )
            })}

            {extraLines.map((line, index) => (
              <div key={line.id} className="px-4 py-3 space-y-2 bg-blue-50/40">
                <div className="flex items-center justify-between gap-2">
                  {isEditable ? (
                    <select
                      value={line.worker_role}
                      onChange={(e) => {
                        const role = e.target.value
                        setExtraLines((prev) => prev.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                worker_role: role,
                                developer_rate_per_hour: VARIATION_RATES[role] ?? l.developer_rate_per_hour,
                              }
                            : l))
                      }}
                      className="text-sm font-medium text-slate-800 bg-white border border-gray-200 rounded-lg px-2 py-1"
                    >
                      {DEVELOPER_ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm font-medium text-slate-800">
                      {ROLE_LABELS[line.worker_role] ?? line.worker_role}
                    </p>
                  )}
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                    Added for developer
                  </span>
                </div>
                <LineEditor
                  hours={line.developer_hours}
                  rate={line.developer_rate_per_hour}
                  isDraft={isEditable}
                  onHours={(val) => setExtraLines((prev) => prev.map((l, i) =>
                    i === index ? { ...l, developer_hours: val } : l))}
                  onRate={(val) => setExtraLines((prev) => prev.map((l, i) =>
                    i === index ? { ...l, developer_rate_per_hour: val } : l))}
                />
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => removeExtraLine(line.id)}
                    className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove line
                  </button>
                )}
              </div>
            ))}
          </div>

          {isEditable && (
            <button
              type="button"
              onClick={addExtraLine}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-blue-300 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-50"
            >
              <Plus className="w-4 h-4" />
              Add worker to developer variation
            </button>
          )}

          <label className={`flex items-start gap-3 p-3 rounded-xl border ${
            isEditable ? 'cursor-pointer hover:bg-gray-50 border-gray-200' : 'border-gray-100 bg-gray-50'
          }`}>
            <input
              type="checkbox"
              checked={materialUpliftEnabled}
              disabled={!isEditable}
              onChange={(e) => setMaterialUpliftEnabled(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">Include {MATERIAL_UPLIFT_PERCENT}% material uplift</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Adds {MATERIAL_UPLIFT_PERCENT}% of the labour subtotal for materials.
              </span>
            </span>
          </label>

          <div className="space-y-1.5 pt-2 border-t border-gray-100 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Labour subtotal</span>
              <span>{fmt(totals.workersSubtotal)}</span>
            </div>
            {materialUpliftEnabled && (
              <div className="flex justify-between text-slate-600">
                <span>Material uplift ({MATERIAL_UPLIFT_PERCENT}%)</span>
                <span>{fmt(totals.materialUpliftAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <span className="font-semibold text-slate-700">Developer total</span>
              <span className="text-xl font-bold text-orange-600">{fmt(displayDeveloperTotal)}</span>
            </div>
          </div>
          </>
          )}

          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1.5 text-sm">
            <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wide">
              Internal — margin (admin only)
            </p>
            <div className="flex justify-between text-slate-600">
              <span>Foreman variation cost</span>
              <span>{fmt(foremanTotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Developer charge</span>
              <span>{fmt(displayDeveloperTotal)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-emerald-100">
              <span className="text-emerald-900">Profit</span>
              <span className={displayDeveloperTotal - foremanTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                {fmt(displayDeveloperTotal - foremanTotal)}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setForemanOpen((p) => !p)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:bg-gray-50"
          >
            <span>Internal — foreman charge log</span>
            {foremanOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {foremanOpen && (
            <div className="px-5 pb-4 space-y-2">
              <p className="text-xs text-slate-400">Admin/management only. Not shown on the developer variation.</p>
              {submission.lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm text-slate-600">
                  <span>
                    {line.is_lump_sum
                      ? (line.description ?? submission.description)
                      : `${line.workers?.first_name} ${line.workers?.surname} — ${line.hours}hrs @ ${fmt(line.rate_per_hour)}/hr`}
                  </span>
                  <span>{fmt(line.total_amount ?? lineTotal(line.hours, line.rate_per_hour))}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-slate-800 pt-2 border-t border-gray-100">
                <span>Foreman total</span>
                <span>{fmt(foremanTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}
      {message && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">{message}</p>
      )}

      <button
        type="button"
        onClick={downloadPdf}
        className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-xl"
      >
        <Download className="w-4 h-4" />
        {isDraft ? 'Download PDF preview' : 'Download PDF for developer'}
      </button>
      <p className="text-xs text-slate-500 text-center -mt-2">
        Send to developer saves your records here — use the PDF to actually share with the developer (email, WhatsApp, etc.).
      </p>

      {isDraft && (
        <div className="space-y-2">
          {!isManagement && (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={saveDraft}
              className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save draft'}
            </button>
            <button
              disabled={busy}
              onClick={submitToDeveloper}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to developer
            </button>
          </div>
          )}
          {isManagement && (
            <button
              disabled={busy}
              onClick={submitToDeveloper}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to developer
            </button>
          )}
          <button
            disabled={busy}
            onClick={deleteDraft}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-red-600 text-sm font-medium hover:bg-red-50 rounded-xl"
          >
            <Trash2 className="w-4 h-4" />
            Delete draft — not charging developer
          </button>
        </div>
      )}

      {isAwaitingAgreement && (
        <div className="space-y-2">
          <button
            disabled={busy}
            onClick={saveDraft}
            className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save changes'}
          </button>
          <p className="text-xs text-slate-500 text-center">
            Record when the developer agrees to these figures. Foreman approval is blocked until then.
          </p>
          <button
            disabled={busy}
            onClick={markAgreed}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark developer agreed
          </button>
          <button
            disabled={busy}
            onClick={deleteDraft}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-red-600 text-sm font-medium hover:bg-red-50 rounded-xl"
          >
            <Trash2 className="w-4 h-4" />
            Delete — not charging developer
          </button>
        </div>
      )}

      {isAgreed && !isPaid && (
        <div className="space-y-2">
          <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-center">
            {isCompanyProfit
              ? 'Developer agreed — capture site agent sign-off when work is done, then download the PDF to submit for payment.'
              : 'Developer agreed — approve the foreman lump sum on the Pending tab. After work is complete, capture site agent sign-off, then download the PDF to submit for payment.'}
          </p>
          <button
            disabled={busy}
            onClick={() => setPayment('paid')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark paid by developer
          </button>
        </div>
      )}

      {isPaid && (
        <button
          disabled={busy}
          onClick={() => setPayment('unpaid')}
          className="w-full flex items-center justify-center gap-2 py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold rounded-xl disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Mark unpaid
        </button>
      )}

      <Link href="/admin/variations" className="block text-center text-sm text-slate-500 hover:text-slate-700">
        ← Foreman variations (pending)
      </Link>
      <Link href="/admin/variations/developer" className="block text-center text-sm text-slate-500 hover:text-slate-700">
        All developer variations
      </Link>
    </div>
  )
}

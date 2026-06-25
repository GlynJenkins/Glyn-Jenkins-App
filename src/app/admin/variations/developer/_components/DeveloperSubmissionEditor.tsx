'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown, ChevronUp, Loader2, Send, CheckCircle, XCircle, ExternalLink, Lock, Trash2,
} from 'lucide-react'
import { lineTotal } from '@/lib/variations/developer'

type Line = {
  id: string
  hours: number
  rate_per_hour: number
  total_amount: number | null
  developer_hours: number | null
  developer_rate_per_hour: number | null
  workers: { first_name: string; surname: string; role: string } | null
}

type Submission = {
  id: string
  description: string
  status: string
  payment_status: string
  foreman_total: number
  developer_total: number
  submitted_to_developer_at: string | null
  paid_at: string | null
  photo_urls: string[]
  signedPhotoUrls: string[]
  sites: { name: string } | null
  foremen: { first_name: string; surname: string } | null
  lines: Line[]
}

const ROLE_LABELS: Record<string, string> = {
  bricklayer: 'Bricklayer',
  labourer:   'Labourer',
  apprentice: 'Apprentice',
}

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
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
  const isLocked = !isDraft

  const [lines, setLines] = useState(
    submission.lines.map((l) => ({
      id: l.id,
      developer_hours: l.developer_hours ?? l.hours,
      developer_rate_per_hour: l.developer_rate_per_hour ?? l.rate_per_hour,
    }))
  )

  const developerTotal = lines.reduce(
    (sum, l) => sum + lineTotal(l.developer_hours, l.developer_rate_per_hour),
    0
  )

  const foremanTotal = submission.lines.reduce(
    (sum, l) => sum + (l.total_amount ?? lineTotal(l.hours, l.rate_per_hour)),
    0
  )

  const saveDraft = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/variations/developer/${submission.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lines }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed.'); return }
      setMessage('Developer figures saved.')
      router.refresh()
    })
  }

  const submitToDeveloper = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const saveRes = await fetch(`/api/admin/variations/developer/${submission.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lines }),
      })
      if (!saveRes.ok) {
        const json = await saveRes.json()
        setError(json.error ?? 'Save failed.')
        return
      }
      const res = await fetch(`/api/admin/variations/developer/${submission.id}/submit`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Submit failed.'); return }
      setMessage('Submitted to developer record.')
      router.refresh()
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
      setMessage('Developer agreed — you can now approve the foreman variation on the Pending tab.')
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 space-y-2 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">
                {submission.foremen?.first_name} {submission.foremen?.surname}
              </p>
              <p className="text-xs text-slate-500">{submission.sites?.name}</p>
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
        </div>

        {/* Developer submission — no foreman charges */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Developer variation</h2>
            {isLocked && <Lock className="w-4 h-4 text-slate-400" />}
          </div>
          <p className="text-xs text-slate-500">
            Prepare figures for the developer while the foreman variation is still pending. Foreman charges are logged separately and are never shown on this view.
          </p>

          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {submission.lines.map((line, index) => {
              const w = line.workers
              const edit = lines[index]
              return (
                <div key={line.id} className="px-4 py-3 space-y-2">
                  <p className="text-sm font-medium text-slate-800">
                    {ROLE_LABELS[w?.role ?? ''] ?? w?.role ?? 'Worker'}
                  </p>
                  {isDraft ? (
                    <div className="flex gap-2">
                      <label className="flex-1 text-xs">
                        <span className="text-slate-500">Hours</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={edit.developer_hours}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setLines((prev) => prev.map((l, i) =>
                              i === index ? { ...l, developer_hours: val } : l))
                          }}
                          className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </label>
                      <label className="flex-1 text-xs">
                        <span className="text-slate-500">Rate (£/hr)</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={edit.developer_rate_per_hour}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setLines((prev) => prev.map((l, i) =>
                              i === index ? { ...l, developer_rate_per_hour: val } : l))
                          }}
                          className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </label>
                      <div className="text-right pt-5 shrink-0">
                        <p className="text-xs text-slate-500">Line total</p>
                        <p className="font-semibold text-sm">
                          {fmt(lineTotal(edit.developer_hours, edit.developer_rate_per_hour))}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">
                        {edit.developer_hours}hrs @ {fmt(edit.developer_rate_per_hour)}/hr
                      </span>
                      <span className="font-semibold">
                        {fmt(lineTotal(edit.developer_hours, edit.developer_rate_per_hour))}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="text-sm font-semibold text-slate-700">Developer total</span>
            <span className="text-xl font-bold text-orange-600">{fmt(developerTotal)}</span>
          </div>
        </div>

        {/* Internal foreman charge log */}
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
                    {line.workers?.first_name} {line.workers?.surname} — {line.hours}hrs @ {fmt(line.rate_per_hour)}/hr
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

      {isDraft && (
        <div className="space-y-2">
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
            Developer agreed — approve the foreman variation on the Pending tab, then record payment here when received.
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

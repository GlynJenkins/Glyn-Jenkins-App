'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Eye, Loader2, ShieldCheck } from 'lucide-react'
import {
  GOV_UK_VIEW_RIGHT_TO_WORK,
  rtwMethodLabel,
  rtwStatusLabel,
  type RightToWorkMethod,
  type RightToWorkStatus,
} from '@/lib/induction/right-to-work'

export type RightToWorkFields = {
  right_to_work_method: RightToWorkMethod | string | null
  right_to_work_document_url: string | null
  right_to_work_share_code: string | null
  right_to_work_status: RightToWorkStatus | string | null
  right_to_work_verified_at: string | null
  right_to_work_verified_by: string | null
  right_to_work_note: string | null
  right_to_work_override_at?: string | null
  right_to_work_override_by?: string | null
  right_to_work_override_note?: string | null
  id_document_url: string | null
  date_of_birth: string | null
}

const STATUS_CHIP: Record<string, string> = {
  verified:  'bg-green-100 text-green-800',
  pending:   'bg-amber-100 text-amber-800',
  follow_up: 'bg-orange-100 text-orange-800',
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function RightToWorkCard({
  workerId,
  rtw,
}: {
  workerId: string
  rtw: RightToWorkFields
}) {
  const router = useRouter()
  const [status, setStatus] = useState(rtw.right_to_work_status ?? 'pending')
  const [verifiedAt, setVerifiedAt] = useState(rtw.right_to_work_verified_at)
  const [verifiedBy, setVerifiedBy] = useState(rtw.right_to_work_verified_by)
  const [savedNote, setSavedNote] = useState(rtw.right_to_work_note)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewBusy, setViewBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const method = rtw.right_to_work_method
  const hasPassportDoc = !!(rtw.right_to_work_document_url || rtw.id_document_url)
  const dob = rtw.date_of_birth ? rtw.date_of_birth.slice(0, 10) : null
  const dobLabel = dob
    ? new Date(`${dob}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null

  const viewPassport = async () => {
    setViewBusy(true)
    setError(null)
    try {
      const type = rtw.right_to_work_document_url ? 'rtw' : 'id'
      const res = await fetch(`/api/admin/workers/${workerId}/documents?type=${type}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Could not open passport.')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open passport.')
    } finally {
      setViewBusy(false)
    }
  }

  const markVerified = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/right-to-work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not mark verified.')
      setStatus('verified')
      setVerifiedAt(json.right_to_work_verified_at ?? new Date().toISOString())
      setVerifiedBy(json.right_to_work_verified_by ?? null)
      setSavedNote((json.right_to_work_note as string | null) ?? (note || null))
      setNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark verified.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-orange-500" />
          <div>
            <p className="font-semibold text-slate-900">Right to Work</p>
            <p className="text-xs text-slate-500">
              Method: {rtwMethodLabel(method)}
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            STATUS_CHIP[status ?? 'pending'] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {rtwStatusLabel(status)}
        </span>
      </div>

      {method === 'passport' && (
        <div className="space-y-2">
          {hasPassportDoc ? (
            <button
              type="button"
              disabled={viewBusy}
              onClick={() => void viewPassport()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
            >
              {viewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              View passport
            </button>
          ) : (
            <p className="text-xs text-amber-700">No passport photo on file.</p>
          )}
        </div>
      )}

      {method === 'share_code' && (
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <p className="text-xs text-slate-500">Share code</p>
          <p className="font-mono text-base font-semibold tracking-wider text-slate-900">
            {rtw.right_to_work_share_code || '—'}
          </p>
          <p className="text-xs text-slate-600">
            Date of birth for check:{' '}
            <span className="font-medium text-slate-800">{dobLabel ?? 'Not on file'}</span>
          </p>
          <a
            href={GOV_UK_VIEW_RIGHT_TO_WORK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:underline"
          >
            Check on gov.uk <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {method === 'no_passport_manual' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          Follow-up needed — arrange manual check (e.g. birth certificate + National Insurance document)
          before activating.
        </p>
      )}

      {!method && (
        <p className="text-xs text-slate-500">
          No right-to-work method recorded (enrolled before this feature, or migration not run).
        </p>
      )}

      {status === 'verified' ? (
        <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2.5 text-xs text-green-900 space-y-1">
          <p>
            Verified by <span className="font-semibold">{verifiedBy ?? '—'}</span>
            {verifiedAt ? ` · ${fmtWhen(verifiedAt)}` : ''}
          </p>
          {savedNote && <p className="text-green-800">Note: {savedNote}</p>}
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <label htmlFor={`rtw-note-${workerId}`} className="block text-xs font-medium text-slate-600">
            Verification note (optional)
          </label>
          <input
            id={`rtw-note-${workerId}`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Passport seen, photo matches"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none
                       focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void markVerified()}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                       text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Mark right to work verified
          </button>
        </div>
      )}

      {rtw.right_to_work_override_at && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          Activation override by {rtw.right_to_work_override_by ?? '—'} ·{' '}
          {fmtWhen(rtw.right_to_work_override_at)}
          {rtw.right_to_work_override_note ? ` — ${rtw.right_to_work_override_note}` : ''}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

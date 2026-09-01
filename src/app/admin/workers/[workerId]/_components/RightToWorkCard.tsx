'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Eye, Loader2, ShieldCheck } from 'lucide-react'
import {
  classifyRtwExpiry,
  formatRtwDate,
  formatRtwDateTime,
  GOV_UK_VIEW_RIGHT_TO_WORK,
  rtwMethodLabel,
  rtwStatusLabel,
  rtwTypeLabel,
  type RightToWorkMethod,
  type RightToWorkStatus,
  type RightToWorkType,
} from '@/lib/induction/right-to-work'
import { openSignedDocument } from '@/lib/admin/open-signed-document'

export type RightToWorkFields = {
  right_to_work_method: RightToWorkMethod | string | null
  right_to_work_document_url: string | null
  right_to_work_share_code: string | null
  right_to_work_status: RightToWorkStatus | string | null
  right_to_work_verified_at: string | null
  right_to_work_verified_by: string | null
  right_to_work_note: string | null
  right_to_work_type?: string | null
  right_to_work_expiry?: string | null
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
  const [rtwType, setRtwType] = useState<RightToWorkType | ''>(
    (rtw.right_to_work_type as RightToWorkType | null) ?? '',
  )
  const [expiry, setExpiry] = useState(
    rtw.right_to_work_expiry ? rtw.right_to_work_expiry.slice(0, 10) : '',
  )
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(status !== 'verified')
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

  const expiryFlag = classifyRtwExpiry(
    rtwType || rtw.right_to_work_type,
    expiry || rtw.right_to_work_expiry,
  )

  const viewPassport = async () => {
    setViewBusy(true)
    setError(null)
    try {
      const type = rtw.right_to_work_document_url ? 'rtw' : 'id'
      const ok = await openSignedDocument(
        `/api/admin/workers/${workerId}/documents?type=${type}`,
        {
          onError: (message) => setError(message),
        },
      )
      if (!ok) return
    } finally {
      setViewBusy(false)
    }
  }

  const markVerified = async () => {
    if (!rtwType) {
      setError('Select continuous or time-limited right to work.')
      return
    }
    if (rtwType === 'time_limited' && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      setError('Enter the permission end date for time-limited right to work.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/right-to-work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note,
          rightToWorkType: rtwType,
          rightToWorkExpiry: rtwType === 'time_limited' ? expiry : null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not mark verified.')
      setStatus('verified')
      setVerifiedAt(json.right_to_work_verified_at ?? new Date().toISOString())
      setVerifiedBy(json.right_to_work_verified_by ?? null)
      setSavedNote((json.right_to_work_note as string | null) ?? (note || null))
      setRtwType((json.right_to_work_type as RightToWorkType) ?? rtwType)
      setExpiry(
        json.right_to_work_expiry
          ? String(json.right_to_work_expiry).slice(0, 10)
          : '',
      )
      setNote('')
      setShowForm(false)
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

      {expiryFlag === 'expired' && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-800">
          Right to work expired — re-check required before this worker continues.
        </p>
      )}
      {expiryFlag === 'expiring_soon' && (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs font-semibold text-orange-900">
          Re-check due soon — permission ends {formatRtwDate(expiry || rtw.right_to_work_expiry)}.
        </p>
      )}

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

      {status === 'verified' && !showForm && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2.5 text-xs text-green-900 space-y-1">
          <p>
            Verified by <span className="font-semibold">{verifiedBy ?? '—'}</span>
            {verifiedAt ? ` · ${formatRtwDateTime(verifiedAt)}` : ''}
          </p>
          <p>
            Type: <span className="font-semibold">{rtwTypeLabel(rtwType || rtw.right_to_work_type)}</span>
            {(rtwType === 'time_limited' || rtw.right_to_work_type === 'time_limited') && (
              <> · Re-check by {formatRtwDate(expiry || rtw.right_to_work_expiry)}</>
            )}
          </p>
          {savedNote && <p className="text-green-800">Note: {savedNote}</p>}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-1 text-xs font-medium text-orange-700 hover:underline"
          >
            Re-check / update verification
          </button>
        </div>
      )}

      {showForm && (
        <div className="space-y-2 pt-1 border-t border-gray-50">
          <p className="text-xs font-medium text-slate-700">Right to work type</p>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 cursor-pointer hover:border-slate-300">
              <input
                type="radio"
                name={`rtw-type-${workerId}`}
                checked={rtwType === 'continuous'}
                onChange={() => {
                  setRtwType('continuous')
                  setExpiry('')
                }}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Continuous</span>
                <span className="block text-xs text-slate-500">
                  British / Irish / settled — no re-check date
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 cursor-pointer hover:border-slate-300">
              <input
                type="radio"
                name={`rtw-type-${workerId}`}
                checked={rtwType === 'time_limited'}
                onChange={() => setRtwType('time_limited')}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Time-limited</span>
                <span className="block text-xs text-slate-500">
                  Visa / temporary permission — set the end date
                </span>
              </span>
            </label>
          </div>

          {rtwType === 'time_limited' && (
            <div className="space-y-1">
              <label htmlFor={`rtw-expiry-${workerId}`} className="block text-xs font-medium text-slate-600">
                Permission end date (re-check by)
              </label>
              <input
                id={`rtw-expiry-${workerId}`}
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none
                           focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>
          )}

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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void markVerified()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                         text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {status === 'verified' ? 'Record re-check' : 'Mark right to work verified'}
            </button>
            {status === 'verified' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowForm(false)}
                className="px-3 py-2.5 text-sm font-medium text-slate-500 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {rtw.right_to_work_override_at && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          Activation override by {rtw.right_to_work_override_by ?? '—'} ·{' '}
          {formatRtwDateTime(rtw.right_to_work_override_at)}
          {rtw.right_to_work_override_note ? ` — ${rtw.right_to_work_override_note}` : ''}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

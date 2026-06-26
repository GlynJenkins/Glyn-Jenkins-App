'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar, Loader2, CheckCircle, XCircle, Trash2, Sun, Users,
} from 'lucide-react'
import {
  daysInclusive,
  formatHolidayRange,
  type HolidayAllowanceRow,
  type HolidayRequestRow,
} from '@/lib/holidays/management'
import HolidayTeamCalendar from './HolidayTeamCalendar'

type Payload = {
  year: number
  isAdmin: boolean
  currentWorkerId: string | null
  allowances: HolidayAllowanceRow[]
  requests: HolidayRequestRow[]
}

function fmtDays(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export default function HolidayTracker({ initial }: { initial: Payload }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [editingAllowance, setEditingAllowance] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    const res = await fetch('/api/admin/holidays', { cache: 'no-store' })
    const json = await res.json()
    if (res.ok) setData(json as Payload)
  }, [])

  const myAllowance = data.allowances.find((a) => a.worker_id === data.currentWorkerId)
  const previewDays = startDate && endDate ? daysInclusive(startDate, endDate) : 0

  const teamCalendar = data.requests.filter(
    (r) => r.status === 'approved' || r.status === 'pending'
  )

  const submitRequest = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/holidays/requests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ startDate, endDate: endDate || startDate, note }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not submit request.')
        return
      }
      setStartDate('')
      setEndDate('')
      setNote('')
      setMessage('Holiday request sent for admin approval.')
      await reload()
      router.refresh()
    })
  }

  const saveAllowance = (workerId: string) => {
    const val = parseFloat(editingAllowance[workerId] ?? '')
    if (isNaN(val) || val < 0) {
      setError('Enter a valid number of days.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/holidays/allowances', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workerId, year: data.year, allocatedDays: val }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not save allowance.')
        return
      }
      setMessage('Allowance updated.')
      await reload()
      router.refresh()
    })
  }

  const reviewRequest = (requestId: string, status: 'approved' | 'rejected') => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/holidays/requests/${requestId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not update request.')
        return
      }
      setMessage(status === 'approved' ? 'Holiday approved.' : 'Holiday rejected.')
      await reload()
      router.refresh()
    })
  }

  const cancelRequest = (requestId: string) => {
    if (!confirm('Cancel this holiday request?')) return
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/holidays/requests/${requestId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not cancel request.')
        return
      }
      setMessage('Request cancelled.')
      await reload()
      router.refresh()
    })
  }

  const pending = data.requests.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-5">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}
      {message && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">{message}</p>
      )}

      <HolidayTeamCalendar
        year={data.year}
        allowances={data.allowances}
        requests={data.requests}
        currentWorkerId={data.currentWorkerId}
      />

      {/* Request holiday */}
      {data.currentWorkerId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-slate-900">Request holiday</h2>
          </div>
          {myAllowance && (
            <p className="text-xs text-slate-500">
              {data.year} allowance: {fmtDays(myAllowance.allocated_days)} days ·{' '}
              {fmtDays(myAllowance.remaining_days)} remaining
              {myAllowance.pending_days > 0 && ` (${fmtDays(myAllowance.pending_days)} pending approval)`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="text-slate-500">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-slate-500">To</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </label>
          </div>
          {previewDays > 0 && (
            <p className="text-xs text-slate-600">
              {previewDays} day{previewDays === 1 ? '' : 's'} requested
            </p>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for admin…"
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
          />
          <button
            type="button"
            disabled={busy || !startDate}
            onClick={submitRequest}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit for approval'}
          </button>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The system blocks dates that overlap another manager&apos;s pending or approved holiday.
          </p>
        </div>
      )}

      {/* Admin: allowances */}
      {data.isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">{data.year} allowances</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.allowances.map((a) => (
              <div key={a.worker_id} className="px-5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {a.worker.first_name} {a.worker.surname}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{a.worker.role}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>Used {fmtDays(a.used_days)}</p>
                    <p className="text-emerald-600 font-medium">{fmtDays(a.remaining_days)} left</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={editingAllowance[a.worker_id] ?? String(a.allocated_days)}
                    onChange={(e) => setEditingAllowance((p) => ({ ...p, [a.worker_id]: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => saveAllowance(a.worker_id)}
                    className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: pending approvals */}
      {data.isAdmin && pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Pending approval ({pending.length})
          </h2>
          {pending.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {r.worker.first_name} {r.worker.surname}
                  </p>
                  <p className="text-sm text-slate-600">{formatHolidayRange(r.start_date, r.end_date)}</p>
                  <p className="text-xs text-slate-500">{fmtDays(r.days_requested)} days</p>
                  {r.note && <p className="text-xs text-slate-500 mt-1">{r.note}</p>}
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Pending
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reviewRequest(r.id, 'approved')}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reviewRequest(r.id, 'rejected')}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 bg-red-50 text-red-600 border border-red-200 text-sm font-semibold rounded-xl disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bookings list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900">All bookings</h2>
        </div>
        {teamCalendar.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No upcoming holidays booked.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {teamCalendar.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {r.worker.first_name} {r.worker.surname}
                  </p>
                  <p className="text-xs text-slate-600">{formatHolidayRange(r.start_date, r.end_date)}</p>
                  <p className="text-xs text-slate-400">{fmtDays(r.days_requested)} days</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                    r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status}
                  </span>
                  {r.worker_id === data.currentWorkerId && r.status === 'pending' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => cancelRequest(r.id)}
                      className="text-[10px] text-red-600 flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

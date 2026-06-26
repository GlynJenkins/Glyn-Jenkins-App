'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import type { JetwashPayLogDay, JetwashPayLogEntry } from '@/lib/jetwash/queries'
import { formatPlotDetails } from '@/lib/jetwash/plot-descriptions'

type PeriodOption = { index: number; label: string; payLabel: string }
type Jetwasher = { id: string; first_name: string; surname: string }

type Payload = {
  period: { index: number; label: string; payLabel: string }
  periods: PeriodOption[]
  jetwashers: Jetwasher[]
  byDay: JetwashPayLogDay[]
  total: number
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function buildCsv(byDay: JetwashPayLogDay[], periodLabel: string) {
  const rows = [
    ['Date', 'Time', 'Site', 'Address', 'Item', 'Type', 'Description', 'Washed by'].join(','),
  ]
  for (const day of byDay) {
    for (const e of day.entries) {
      rows.push([
        day.label,
        fmtTime(e.washed_at),
        `"${e.site_name.replace(/"/g, '""')}"`,
        `"${(e.site_address ?? '').replace(/"/g, '""')}"`,
        `"${e.title.replace(/"/g, '""')}"`,
        e.item_type,
        `"${formatPlotDetails(e.details).replace(/"/g, '""')}"`,
        e.washer ? `"${e.washer.first_name} ${e.washer.surname}"` : '',
      ].join(','))
    }
  }
  return rows.join('\n')
}

export default function JetwashPayLog({ initial }: { initial: Payload }) {
  const [data, setData] = useState(initial)
  const [periodIndex, setPeriodIndex] = useState(initial.period.index)
  const [workerId, setWorkerId] = useState('')
  const [busy, startTransition] = useTransition()

  const reload = useCallback((nextPeriod: number, nextWorker: string) => {
    startTransition(async () => {
      const params = new URLSearchParams({ periodIndex: String(nextPeriod) })
      if (nextWorker) params.set('workerId', nextWorker)
      const res = await fetch(`/api/admin/jetwash/pay-log?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setData(json as Payload)
    })
  }, [])

  const shiftPeriod = (delta: number) => {
    const next = Math.max(0, Math.min(data.periods.length - 1, periodIndex + delta))
    setPeriodIndex(next)
    reload(next, workerId)
  }

  const downloadCsv = () => {
    const csv = buildCsv(data.byDay, data.period.label)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jetwash-${data.period.label.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy || periodIndex >= data.periods.length - 1}
            onClick={() => shiftPeriod(1)}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            aria-label="Previous pay period"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-0">
            <p className="text-sm font-semibold text-slate-900">{data.period.label}</p>
            <p className="text-xs text-slate-500">Pay date: {data.period.payLabel}</p>
          </div>
          <button
            type="button"
            disabled={busy || periodIndex <= 0}
            onClick={() => shiftPeriod(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-40"
            aria-label="Next pay period"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2">
          <select
            value={workerId}
            onChange={(e) => {
              setWorkerId(e.target.value)
              reload(periodIndex, e.target.value)
            }}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
          >
            <option value="">All jetwashers</option>
            {data.jetwashers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.first_name} {w.surname}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || data.total === 0}
            onClick={downloadCsv}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>

        <p className="text-xs text-slate-500">
          {data.total} plot{data.total === 1 ? '' : 's'} washed this pay window
          {busy && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
        </p>
      </div>

      {data.total === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-slate-500">No plots washed in this pay window yet.</p>
        </div>
      ) : (
        data.byDay.map((day) => (
          <div key={day.date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-900">{day.label}</p>
              <p className="text-xs text-slate-500">{day.entries.length} plot{day.entries.length === 1 ? '' : 's'}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {day.entries.map((e: JetwashPayLogEntry) => (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                      {e.item_type === 'garage' && (
                        <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 mt-0.5">
                          Garage
                        </span>
                      )}
                      {e.site_name && (
                        <p className="text-xs text-slate-500 truncate">{e.site_name}</p>
                      )}
                      {e.site_address && (
                        <p className="text-xs text-slate-400 truncate">{e.site_address}</p>
                      )}
                      {e.details.length > 0 && (
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {formatPlotDetails(e.details)}
                        </p>
                      )}
                      {e.washer && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {e.washer.first_name} {e.washer.surname}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{fmtTime(e.washed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <Link
        href="/admin/jetwash"
        className="block text-center text-xs text-slate-500 hover:text-orange-600"
      >
        ← Back to sites
      </Link>
    </div>
  )
}

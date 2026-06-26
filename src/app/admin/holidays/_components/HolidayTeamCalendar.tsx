'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { HolidayAllowanceRow, HolidayRequestRow } from '@/lib/holidays/management'
import {
  WEEKDAY_LABELS,
  bookingsForDate,
  buildPersonColors,
  colorForWorker,
  formatMonthLabel,
  monthGrid,
  toDateKey,
} from '@/lib/holidays/calendar'

type Props = {
  year: number
  allowances: HolidayAllowanceRow[]
  requests: HolidayRequestRow[]
  currentWorkerId?: string | null
}

export default function HolidayTeamCalendar({
  year,
  allowances,
  requests,
  currentWorkerId,
}: Props) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear, setViewYear] = useState(today.getFullYear())

  const members = useMemo(
    () => allowances.map((a) => a.worker),
    [allowances]
  )
  const personColors = useMemo(() => buildPersonColors(members), [members])
  const cells = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewMonth(d.getMonth())
    setViewYear(d.getFullYear())
  }

  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-blue-600 shrink-0" />
        <h2 className="font-semibold text-slate-900">Live team calendar</h2>
      </div>

      {/* Legend */}
      {personColors.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-x-4 gap-y-2">
          {personColors.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 text-xs">
              <span className={`w-3 h-3 rounded-full ${p.solid} shrink-0`} />
              <span className={`font-medium ${p.text}`}>
                {p.label}
                {p.id === currentWorkerId && ' (you)'}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded border-2 border-dashed border-slate-300 bg-slate-50 shrink-0" />
            Pending approval
          </div>
        </div>
      )}

      {/* Month nav */}
      <div className="px-5 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="text-sm font-semibold text-slate-900">{formatMonthLabel(viewYear, viewMonth)}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Grid */}
      <div className="px-3 pb-4">
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="bg-slate-50 text-[10px] font-semibold text-slate-500 text-center py-2"
            >
              {label}
            </div>
          ))}

          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="bg-white min-h-[52px]" />
            }

            const dateKey = toDateKey(viewYear, viewMonth, day)
            const bookings = bookingsForDate(dateKey, requests)
            const approved = bookings.filter((b) => b.status === 'approved')
            const pending = bookings.filter((b) => b.status === 'pending')
            const isToday = dateKey === todayKey
            const isWeekend = idx % 7 >= 5

            const title = bookings.length
              ? bookings.map((b) => `${b.name} (${b.status})`).join(', ')
              : undefined

            return (
              <div
                key={dateKey}
                title={title}
                className={`relative bg-white min-h-[52px] p-0.5 flex flex-col ${
                  isWeekend ? 'bg-slate-50/80' : ''
                } ${isToday ? 'ring-2 ring-inset ring-orange-400 z-[1]' : ''}`}
              >
                <span
                  className={`text-[10px] font-medium px-1 ${
                    isToday ? 'text-orange-600' : 'text-slate-500'
                  }`}
                >
                  {day}
                </span>

                <div className="flex-1 flex flex-col gap-px mt-0.5">
                  {approved.map((b) => {
                    const c = colorForWorker(personColors, b.workerId)
                    return (
                      <div
                        key={`${dateKey}-a-${b.workerId}`}
                        className={`flex-1 min-h-[6px] rounded-sm ${c?.solid ?? 'bg-slate-400'} opacity-90`}
                      />
                    )
                  })}
                  {pending.map((b) => {
                    const c = colorForWorker(personColors, b.workerId)
                    return (
                      <div
                        key={`${dateKey}-p-${b.workerId}`}
                        className={`flex-1 min-h-[6px] rounded-sm border border-dashed ${c?.border ?? 'border-slate-300'} ${c?.light ?? 'bg-slate-100'}`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="px-5 pb-4 text-[11px] text-slate-400 leading-relaxed">
        Solid colours = approved holiday (blocked). Dashed = pending approval. Navigate months to plan ahead.
        {viewYear !== year && ` Showing ${viewYear} — allowance year is ${year}.`}
      </p>
    </div>
  )
}

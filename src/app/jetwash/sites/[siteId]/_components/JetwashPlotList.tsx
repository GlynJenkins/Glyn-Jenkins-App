'use client'

import { useState, useTransition, useCallback } from 'react'
import { Check, Loader2, Droplets } from 'lucide-react'
import type { JetwashPlotRow } from '@/lib/jetwash/queries'

type Props = {
  siteId: string
  siteName: string
  initialPlots: JetwashPlotRow[]
  canMark?: boolean
}

function fmtWashedAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'short',
    hour:  '2-digit',
    minute: '2-digit',
  })
}

export default function JetwashPlotList({
  siteId,
  siteName,
  initialPlots,
  canMark = true,
}: Props) {
  const [plots, setPlots] = useState(initialPlots)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const washed = plots.filter((p) => p.washed_at).length
  const total = plots.length
  const pct = total ? Math.round((washed / total) * 100) : 0

  const markWashed = useCallback((plot: JetwashPlotRow) => {
    if (!canMark || plot.washed_at) return

    setError(null)
    setBusyId(plot.id)
    startTransition(async () => {
      const res = await fetch(`/api/jetwash/records/${plot.id}`, { method: 'POST' })
      const json = await res.json()
      setBusyId(null)

      if (!res.ok) {
        setError(json.error ?? 'Could not mark plot washed.')
        return
      }

      const refresh = await fetch(`/api/jetwash/sites/${siteId}`, { cache: 'no-store' })
      const refreshed = await refresh.json()
      if (refresh.ok) setPlots(refreshed.plots)
    })
  }, [canMark, siteId])

  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Droplets className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No plots on this site yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Upload the site price grid — plot numbers will appear here automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-slate-900">{siteName}</p>
          <p className="text-xs text-slate-500">{washed} / {total} washed</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          {canMark
            ? 'Tap a plot to mark as washed. Once green it cannot be washed again.'
            : 'View only.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-px bg-gray-100 border-b border-gray-100">
          <div className="bg-slate-50 px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Plot
          </div>
          <div className="bg-slate-50 px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-center min-w-[88px]">
            Washed
          </div>
        </div>

        <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
          {plots.map((plot) => {
            const isWashed = !!plot.washed_at
            const isBusy = busyId === plot.id

            return (
              <div
                key={plot.id}
                className={`grid grid-cols-[1fr_auto] items-center ${
                  isWashed ? 'bg-green-50' : 'bg-white'
                }`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${isWashed ? 'text-green-800' : 'text-slate-900'}`}>
                      {plot.title}
                    </p>
                    {plot.item_type === 'garage' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        Garage
                      </span>
                    )}
                  </div>
                  {plot.item_type === 'house' && plot.details.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {plot.details.map((d) => (
                        <p key={`${plot.id}-${d.label}`} className="text-[11px] text-slate-600 leading-snug">
                          <span className="text-slate-400">{d.label}:</span> {d.value}
                        </p>
                      ))}
                    </div>
                  )}
                  {isWashed && (
                    <p className="text-[10px] text-green-600 mt-0.5">
                      {plot.washer
                        ? `${plot.washer.first_name} ${plot.washer.surname} · `
                        : ''}
                      {fmtWashedAt(plot.washed_at!)}
                    </p>
                  )}
                </div>

                <div className="px-4 py-3 flex justify-center min-w-[88px]">
                  {!canMark ? (
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isWashed ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-300'
                      }`}
                    >
                      {isWashed && <Check className="w-4 h-4" />}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isWashed || isBusy}
                      onClick={() => markWashed(plot)}
                      aria-label={isWashed ? `Plot ${plot.plot_number} already washed` : `Mark plot ${plot.plot_number} washed`}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        isWashed
                          ? 'bg-green-500 text-white cursor-default'
                          : 'bg-slate-100 text-slate-400 hover:bg-orange-100 hover:text-orange-600 border border-slate-200'
                      } disabled:opacity-70`}
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isWashed ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="w-4 h-4 rounded border-2 border-current" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

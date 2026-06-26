'use client'

import Link from 'next/link'
import { Building2, MapPin, ChevronRight } from 'lucide-react'
import type { QaSiteSummary } from '@/lib/qa/queries'

export default function QaSiteList({ sites }: { sites: QaSiteSummary[] }) {
  if (sites.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No active sites yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Plot lists appear when a site spreadsheet is uploaded.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sites.map((site) => {
        const pct = site.total_slots
          ? Math.round((site.completed_slots / site.total_slots) * 100)
          : 0
        const complete = site.total_slots > 0 && site.completed_slots === site.total_slots

        return (
          <Link
            key={site.site_id}
            href={`/admin/qa/${site.site_id}`}
            className={`block bg-white rounded-2xl border shadow-sm p-4 transition-colors ${
              complete
                ? 'border-green-200 hover:border-green-300'
                : 'border-gray-100 hover:border-orange-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{site.name}</p>
                {site.address && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {site.address}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  {site.completed_slots} of {site.total_slots} inspections complete
                  {site.total_plots > 0 && ` · ${site.total_plots} plots`}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 mt-1" />
            </div>

            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-orange-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={`text-[10px] font-semibold mt-1.5 ${complete ? 'text-green-600' : 'text-orange-600'}`}>
              {site.total_plots === 0 ? 'Upload site grid for plots' : `${pct}% complete`}
            </p>
          </Link>
        )
      })}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { Building2, MapPin, ChevronRight } from 'lucide-react'
import type { FiresockSiteSummary } from '@/lib/firesock/queries'

export default function FiresockSiteList({ sites }: { sites: FiresockSiteSummary[] }) {
  if (sites.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No active sites yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sites.map((site) => {
        const pct = site.required_plots
          ? Math.round((site.complete_plots / site.required_plots) * 100)
          : 0
        const complete = site.required_plots > 0 && site.complete_plots === site.required_plots

        return (
          <Link
            key={site.site_id}
            href={`/admin/firesocks/${site.site_id}`}
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
                  {site.complete_plots} of {site.required_plots} plots complete
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 mt-1" />
            </div>

            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${complete ? 'bg-green-500' : 'bg-orange-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

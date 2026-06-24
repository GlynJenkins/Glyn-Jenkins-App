'use client'

import Link from 'next/link'
import { MapPin, Grid3x3, FileUp, ClipboardList } from 'lucide-react'

type Site = {
  id: string
  name: string
  address: string | null
  is_active: boolean
}

interface Props {
  site: Site
  foremanId: string
  inactive?: boolean
}

export default function ForemanSiteCard({ site, foremanId, inactive = false }: Props) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border space-y-4 ${
      inactive ? 'border-gray-100 opacity-60' : 'border-gray-100'
    }`}>

      {/* Site name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="font-semibold text-slate-900 text-base leading-tight">
            {site.name}
          </h3>
          {site.address && (
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <MapPin className="w-3 h-3" />
              {site.address}
            </div>
          )}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          inactive
            ? 'bg-gray-100 text-gray-500'
            : 'bg-green-100 text-green-700'
        }`}>
          {inactive ? 'Inactive' : 'Active'}
        </span>
      </div>

      {/* Action buttons */}
      {!inactive && (
        <div className="grid grid-cols-1 gap-2">
          <Link
            href={`/foreman/sites/${site.id}/grid`}
            className="flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800
                       text-white rounded-xl transition-colors text-sm font-medium"
          >
            <Grid3x3 className="w-4 h-4 text-orange-400 shrink-0" />
            View Site Price Grid
          </Link>

          <Link
            href={`/foreman/sites/${site.id}/variation`}
            className="flex items-center gap-3 px-4 py-3 bg-orange-50 hover:bg-orange-100
                       text-orange-700 rounded-xl border border-orange-200 transition-colors text-sm font-medium"
          >
            <FileUp className="w-4 h-4 shrink-0" />
            Submit Variation / Daywork
          </Link>

          <Link
            href={`/foreman/sites/${site.id}/claim`}
            className="flex items-center gap-3 px-4 py-3 bg-blue-50 hover:bg-blue-100
                       text-blue-700 rounded-xl border border-blue-200 transition-colors text-sm font-medium"
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            Build Fortnightly Claim
          </Link>
        </div>
      )}
    </div>
  )
}

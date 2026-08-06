'use client'

import { useState } from 'react'
import GuideView from '@/components/guides/GuideView'

type Tab = 'management' | 'foreman'

type Props = {
  managementMarkdown: string
  foremanMarkdown:    string
  managementPdfHref:  string
  foremanPdfHref:     string
}

export default function AdminGuidesTabs({
  managementMarkdown,
  foremanMarkdown,
  managementPdfHref,
  foremanPdfHref,
}: Props) {
  const [tab, setTab] = useState<Tab>('management')

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('management')}
          className={`flex-1 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
            tab === 'management'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Management guide
        </button>
        <button
          type="button"
          onClick={() => setTab('foreman')}
          className={`flex-1 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
            tab === 'foreman'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Foreman guide
        </button>
      </div>

      {tab === 'management' ? (
        <GuideView markdown={managementMarkdown} pdfHref={managementPdfHref} />
      ) : (
        <GuideView markdown={foremanMarkdown} pdfHref={foremanPdfHref} />
      )}
    </div>
  )
}

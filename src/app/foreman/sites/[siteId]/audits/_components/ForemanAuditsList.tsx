'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, ClipboardList, Download } from 'lucide-react'
import { openPdfDownload } from '@/lib/site-audits/open-pdf-download'

type Row = {
  id: string
  auditedByName: string
  auditedByRole: string | null
  auditDate: string
  itemCount: number
  pdfReady: boolean
  unseen: boolean
  done: boolean
}

export default function ForemanAuditsList({
  siteId,
  audits,
}: {
  siteId: string
  audits: Row[]
}) {
  const [error, setError] = useState<string | null>(null)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  const download = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/foreman/site-audits/${id}/pdf`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Download failed.')
      openPdfDownload(json.url, json.filename ?? 'site-audit.pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    }
  }

  if (!audits.length) {
    return <p className="text-center text-sm text-slate-400 py-16">No site audits yet.</p>
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}
      {audits.map((a) => (
        <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative ${
              a.done ? 'bg-emerald-50' : 'bg-slate-100'
            }`}>
              {a.done
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <ClipboardList className="w-5 h-5 text-slate-500" />}
              {a.unseen && !a.done && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900">{fmt(a.auditDate)}</p>
                {a.done ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5
                                   rounded bg-emerald-100 text-emerald-700">
                    Done
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5
                                   rounded bg-amber-100 text-amber-800">
                    To do
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {a.auditedByName}
                {a.auditedByRole ? ` · ${a.auditedByRole}` : ''}
                {' · '}
                {a.itemCount} item{a.itemCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/foreman/sites/${siteId}/audits/${a.id}`}
              className="px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-sm font-medium"
            >
              View
            </Link>
            {a.pdfReady && (
              <button
                type="button"
                onClick={() => void download(a.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100
                           text-slate-700 text-sm font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { ClipboardList, Download } from 'lucide-react'

type Row = {
  id: string
  auditedByName: string
  auditedByRole: string | null
  auditDate: string
  itemCount: number
  pdfReady: boolean
  unseen: boolean
}

export default function ForemanAuditsList({
  siteId,
  audits,
}: {
  siteId: string
  audits: Row[]
}) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  const download = async (id: string) => {
    const res = await fetch(`/api/foreman/site-audits/${id}/pdf`)
    const json = await res.json()
    if (res.ok && json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
  }

  if (!audits.length) {
    return <p className="text-center text-sm text-slate-400 py-16">No site audits yet.</p>
  }

  return (
    <div className="space-y-3">
      {audits.map((a) => (
        <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 relative">
              <ClipboardList className="w-5 h-5 text-slate-500" />
              {a.unseen && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{fmt(a.auditDate)}</p>
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

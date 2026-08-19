'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Loader2 } from 'lucide-react'
import { openPdfDownload } from '@/lib/site-audits/open-pdf-download'

type Item = {
  id: string
  plotNumber: string
  description: string
  photos: { id: string; url: string | null }[]
}

export default function ForemanAuditDetail({
  siteId,
  auditId,
}: {
  siteId: string
  auditId: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<{
    siteName: string
    auditedByName: string
    auditedByRole: string | null
    auditDate: string
    generalNotes: string | null
    pdfReady: boolean
  } | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/foreman/site-audits/${auditId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not load audit.')
        if (cancelled) return
        setAudit(json.audit)
        setItems(json.items ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load audit.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [auditId])

  const download = async () => {
    try {
      const res = await fetch(`/api/foreman/site-audits/${auditId}/pdf`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Download failed.')
      openPdfDownload(json.url, json.filename ?? 'site-audit.pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !audit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error ?? 'Not found.'}</p>
        <Link href={`/foreman/sites/${siteId}/audits`} className="text-sm text-orange-700 font-medium">
          ← Back
        </Link>
      </div>
    )
  }

  const grouped = new Map<string, Item[]>()
  for (const item of items) {
    const list = grouped.get(item.plotNumber) ?? []
    list.push(item)
    grouped.set(item.plotNumber, list)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
        <p className="text-sm text-slate-500">
          {fmt(audit.auditDate)} · {audit.auditedByName}
          {audit.auditedByRole ? ` (${audit.auditedByRole})` : ''}
        </p>
        <p className="font-semibold text-slate-900">{audit.siteName}</p>
        {audit.generalNotes && (
          <p className="text-sm text-slate-600 pt-2 border-t border-gray-50 mt-2">
            {audit.generalNotes}
          </p>
        )}
      </div>

      {[...grouped.entries()].map(([plot, plotItems]) => (
        <div key={plot} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="font-bold text-slate-900">Plot {plot}</p>
          {plotItems.map((item) => (
            <div key={item.id} className="border-t border-gray-50 pt-2 space-y-2">
              <p className="text-sm text-slate-700">{item.description}</p>
              <div className="flex flex-wrap gap-2">
                {item.photos.map((p) =>
                  p.url ? (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLightbox(p.url)}
                      className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {audit.pdfReady && (
        <button
          type="button"
          onClick={() => void download()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                     bg-slate-900 text-white text-sm font-semibold"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      )}

      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl" />
        </button>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, Loader2 } from 'lucide-react'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<{
    siteName: string
    auditedByName: string
    auditedByRole: string | null
    auditDate: string
    generalNotes: string | null
    pdfReady: boolean
    done: boolean
    doneAt: string | null
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

  const setDone = async (done: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/foreman/site-audits/${auditId}/done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not update status.')
      setAudit((prev) =>
        prev
          ? {
              ...prev,
              done,
              doneAt: done ? new Date().toISOString() : null,
            }
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.')
    } finally {
      setBusy(false)
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

  if (error && !audit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <Link href={`/foreman/sites/${siteId}/audits`} className="text-sm text-orange-700 font-medium">
          ← Back
        </Link>
      </div>
    )
  }

  if (!audit) return null

  const grouped = new Map<string, Item[]>()
  for (const item of items) {
    const list = grouped.get(item.plotNumber) ?? []
    list.push(item)
    grouped.set(item.plotNumber, list)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-slate-500">
            {fmt(audit.auditDate)} · {audit.auditedByName}
            {audit.auditedByRole ? ` (${audit.auditedByRole})` : ''}
          </p>
          {audit.done ? (
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

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {audit.done ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100
                          text-emerald-800 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Marked done{audit.doneAt ? ` · ${fmt(audit.doneAt)}` : ''}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setDone(false)}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            {busy ? 'Updating…' : 'Undo — mark as to do'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void setDone(true)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                     bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {busy ? 'Saving…' : 'Mark as done'}
        </button>
      )}

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

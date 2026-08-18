'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, X } from 'lucide-react'

type UnseenAudit = {
  id: string
  siteId: string
  siteName: string
  auditDate: string
  itemCount: number
}

export default function UnseenSiteAuditsModal() {
  const [audits, setAudits] = useState<UnseenAudit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/foreman/site-audits/unseen')
        const json = await res.json()
        if (!res.ok || cancelled) return
        const list = (json.audits ?? []) as UnseenAudit[]
        if (list.length) {
          setAudits(list)
          setOpen(true)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dismissAll = async () => {
    await Promise.all(
      audits.map((a) =>
        fetch(`/api/foreman/site-audits/${a.id}/seen`, { method: 'POST' }).catch(() => null),
      ),
    )
    setOpen(false)
  }

  if (!open || audits.length === 0) return null

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-orange-600" />
            <p className="font-bold text-slate-900">
              {audits.length === 1 ? 'New site audit' : 'New site audits'}
            </p>
          </div>
          <button type="button" onClick={() => void dismissAll()} className="text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {audits.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-gray-100 bg-slate-50 p-4 space-y-2"
            >
              <p className="font-semibold text-slate-900">
                {a.siteName}, {fmt(a.auditDate)}
              </p>
              <p className="text-xs text-slate-500">
                {a.itemCount} item{a.itemCount === 1 ? '' : 's'}
              </p>
              <Link
                href={`/foreman/sites/${a.siteId}/audits/${a.id}`}
                onClick={() => setOpen(false)}
                className="inline-flex px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                View audit
              </Link>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void dismissAll()}
            className="w-full py-2.5 text-sm font-medium text-slate-500"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

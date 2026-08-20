'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, ClipboardList, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { openPdfDownload } from '@/lib/site-audits/open-pdf-download'

type Assignee = {
  workerId: string | null
  workerName: string
  done: boolean
}

type AuditRow = {
  id: string
  auditedByName: string
  auditedByRole: string | null
  auditDate: string
  status: string
  pdfReady: boolean
  itemCount: number
  assignees?: Assignee[]
  progress?: 'done' | 'outstanding' | 'partial' | 'none'
  doneCount?: number
  assigneeCount?: number
}

function ProgressBadge({
  progress,
  doneCount = 0,
  assigneeCount = 0,
}: {
  progress: AuditRow['progress']
  doneCount?: number
  assigneeCount?: number
}) {
  if (progress === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide
                       px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        Done
      </span>
    )
  }
  if (progress === 'partial') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5
                       rounded bg-sky-100 text-sky-800">
        {doneCount}/{assigneeCount} done
      </span>
    )
  }
  if (progress === 'outstanding') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5
                       rounded bg-amber-100 text-amber-800">
        Outstanding
      </span>
    )
  }
  return null
}

export default function SiteAuditsListClient({
  siteId,
  siteName,
  audits,
  draft,
}: {
  siteId: string
  siteName: string
  audits: AuditRow[]
  draft: AuditRow | null
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/site-audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not start audit.')
        router.push(`/admin/site-audits/${json.auditId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start audit.')
      }
    })
  }

  const deleteDraft = async (id: string) => {
    if (!window.confirm('Delete this draft site audit?')) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/site-audits/${id}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not delete draft.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete draft.')
      }
    })
  }

  const downloadPdf = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/site-audits/${id}/pdf`)
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

  return (
    <div className="space-y-4">
      {draft && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">
            Draft in progress — {draft.itemCount} item{draft.itemCount === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/site-audits/${draft.id}`}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold"
            >
              Resume walk
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteDraft(draft.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                         font-medium text-red-700 bg-white border border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete draft
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={busy || !!draft}
        onClick={start}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                   bg-slate-900 text-white font-semibold text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Start site audit
      </button>
      {draft && (
        <p className="text-xs text-slate-500 text-center">
          Finish or delete the draft before starting another walk on {siteName}.
        </p>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {audits.filter((a) => a.status === 'completed').map((a) => (
          <div
            key={a.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                a.progress === 'done' ? 'bg-emerald-50' : 'bg-slate-100'
              }`}>
                {a.progress === 'done'
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <ClipboardList className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900">{fmt(a.auditDate)}</p>
                  <ProgressBadge
                    progress={a.progress}
                    doneCount={a.doneCount}
                    assigneeCount={a.assigneeCount}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Issued by {a.auditedByName}
                  {a.auditedByRole ? ` · ${a.auditedByRole}` : ''}
                  {' · '}
                  {a.itemCount} item{a.itemCount === 1 ? '' : 's'}
                </p>
                {(a.assignees?.length ?? 0) > 0 ? (
                  <div className="pt-1 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Assigned to
                    </p>
                    {a.assignees!.map((person, i) => (
                      <div
                        key={`${person.workerId ?? person.workerName}-${i}`}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-slate-700 truncate">{person.workerName}</span>
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide
                                         px-1.5 py-0.5 rounded ${
                          person.done
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {person.done ? 'Done' : 'Outstanding'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 pt-1">No foremen assigned to this site</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/site-audits/${a.id}`}
                className="px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-sm font-medium"
              >
                View
              </Link>
              <Link
                href={`/admin/site-audits/${a.id}?edit=1`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900
                           text-white text-sm font-medium"
              >
                Edit
              </Link>
              {a.pdfReady && (
                <button
                  type="button"
                  onClick={() => void downloadPdf(a.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                             bg-slate-100 text-slate-700 text-sm font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </button>
              )}
            </div>
          </div>
        ))}
        {!audits.some((a) => a.status === 'completed') && (
          <p className="text-center text-sm text-slate-400 py-10">No completed audits yet.</p>
        )}
      </div>
    </div>
  )
}

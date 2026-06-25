'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Send, Loader2, ChevronRight } from 'lucide-react'

export type PendingForemanGroup = {
  key: string
  claimIds: string[]
  foremanName: string
  siteName: string
  description: string
  total: number
  submittedAt: string
}

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

export default function PendingForemanQueue({ groups }: { groups: PendingForemanGroup[] }) {
  const router = useRouter()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (groups.length === 0) return null

  const prepare = (group: PendingForemanGroup) => {
    setError(null)
    setBusyKey(group.key)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/variations/developer/create', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ids: group.claimIds }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not create developer draft.')
        router.push(`/admin/variations/developer/${json.developerSubmissionId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create developer draft.')
        setBusyKey(null)
      }
    })
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
        <p className="text-sm font-semibold text-amber-900">Foreman submitted — not in developer queue yet</p>
        <p className="text-xs text-amber-800 leading-relaxed">
          Daniel&apos;s (or any foreman&apos;s) variation appears here first. Tap{' '}
          <strong>Prepare for developer</strong> to generate the developer variation, adjust figures, then send for agreement.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {groups.map((g) => (
        <div
          key={g.key}
          className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 space-y-1">
            <p className="font-semibold text-slate-900">{g.foremanName}</p>
            <p className="text-xs text-slate-500">{g.siteName}</p>
            <p className="text-sm text-slate-700 line-clamp-2">{g.description}</p>
            <p className="text-xs text-slate-400">
              Foreman total {fmt(g.total)} ·{' '}
              {new Date(g.submittedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex border-t border-gray-100">
            <Link
              href="/admin/variations"
              className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-slate-600 hover:bg-gray-50"
            >
              View on Pending tab <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              disabled={busyKey === g.key}
              onClick={() => prepare(g)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busyKey === g.key
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Prepare for developer
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

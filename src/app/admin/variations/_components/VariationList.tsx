'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Clock, Loader2, ExternalLink, Send } from 'lucide-react'

type Claim = {
  id:                     string
  hours:                  number
  rate_per_hour:          number
  total_amount:           number | null
  description:            string
  photo_urls:             string[]
  signedPhotoUrls:        string[]
  status:                 string
  admin_rejection_reason: string | null
  developer_submission_id: string | null
  developer_submission_status: string | null
  created_at:             string
  sites:   { id: string; name: string } | null
  workers: { id: string; first_name: string; surname: string; role: string } | null
  foremen: { id: string; first_name: string; surname: string } | null
}

// Group claims submitted at the same time (same photo path = same submission)
type Group = {
  key:         string
  claims:      Claim[]
  description: string
  site:        { id: string; name: string } | null
  foreman:     { id: string; first_name: string; surname: string } | null
  total:       number
  status:      string
  photoUrls:   string[]
  date:        string
  developerSubmissionId: string | null
  developerSubmissionStatus: string | null
}

const ROLE_LABELS: Record<string, string> = {
  bricklayer: 'Bricklayer', labourer: 'Labourer', apprentice: 'Apprentice',
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function buildGroups(claims: Claim[]): Group[] {
  const map = new Map<string, Group>()
  for (const c of claims) {
    // Group key = shared photo path (unique per submission) OR fallback to id
    const key = (c.photo_urls ?? [])[0] ?? c.id
    if (!map.has(key)) {
      map.set(key, {
        key,
        claims:      [],
        description: c.description,
        site:        c.sites,
        foreman:     c.foremen,
        total:       0,
        status:      c.status,
        photoUrls:   c.signedPhotoUrls ?? [],
        date:        c.created_at,
        developerSubmissionId: c.developer_submission_id ?? null,
        developerSubmissionStatus: c.developer_submission_status ?? null,
      })
    }
    const g = map.get(key)!
    g.claims.push(c)
    g.total += c.total_amount ?? 0
  }
  // Sort newest first
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

function GroupCard({
  group,
  onAction,
  onCreateDeveloper,
}: {
  group:     Group
  onAction?: (ids: string[], status: string, reason?: string) => void
  onCreateDeveloper?: (ids: string[]) => void
}) {
  const [rejectMode, setRejectMode]   = useState(false)
  const [reason,     setReason]       = useState('')
  const [busy,       startTransition] = useTransition()

  const submitted = new Date(group.date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const ids = group.claims.map((c) => c.id)

  const hasDeveloperDraft = !!group.developerSubmissionId
  const developerAgreed = group.developerSubmissionStatus === 'agreed' || group.developerSubmissionStatus === 'paid'
  const canApproveForeman = !hasDeveloperDraft || developerAgreed

  const statusBadge: Record<string, string> = {
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 space-y-1 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">
              {group.foreman?.first_name} {group.foreman?.surname}
            </p>
            <p className="text-xs text-slate-500">{group.site?.name} • {submitted}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusBadge[group.status] ?? ''}`}>
            {group.status.charAt(0).toUpperCase() + group.status.slice(1)}
          </span>
        </div>
        <p className="text-sm text-slate-700 bg-gray-50 rounded-xl p-3 mt-2">
          {group.description}
        </p>
      </div>

      {/* Worker lines table */}
      <div className="divide-y divide-gray-50">
        {group.claims.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {c.workers?.first_name} {c.workers?.surname}
              </p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[c.workers?.role ?? ''] ?? c.workers?.role} • {c.hours}hrs @ £{c.rate_per_hour}/hr
              </p>
            </div>
            <p className="font-semibold text-slate-800 text-sm">{fmt(c.total_amount)}</p>
          </div>
        ))}
      </div>

      {/* Grand total + photo */}
      <div className="px-5 py-4 bg-slate-900 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-xs">Submission Total</p>
          <p className="text-2xl font-bold text-orange-400">{fmt(group.total)}</p>
        </div>
        {group.photoUrls.length > 0 && (
          <a
            href={group.photoUrls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-300 underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View Photo
          </a>
        )}
      </div>

      {group.status === 'approved' && group.developerSubmissionId && (
        <div className="p-4 border-t border-gray-100">
          <Link
            href={`/admin/variations/developer/${group.developerSubmissionId}`}
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
            View developer variation
          </Link>
        </div>
      )}

      {/* Developer draft — while foreman still pending */}
      {group.status === 'pending' && (
        <div className="p-4 border-t border-gray-100 space-y-2">
          {hasDeveloperDraft ? (
            <>
              <Link
                href={`/admin/variations/developer/${group.developerSubmissionId}`}
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
                {developerAgreed ? 'Developer agreed — view record' : 'View / edit developer draft'}
              </Link>
              {!developerAgreed && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center">
                  Foreman approval blocked until developer agrees (or delete the developer draft if not charging them).
                </p>
              )}
            </>
          ) : onCreateDeveloper ? (
            <button
              disabled={busy}
              onClick={() => startTransition(() => onCreateDeveloper(ids))}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Prepare developer variation
            </button>
          ) : null}
          {!hasDeveloperDraft && (
            <p className="text-xs text-slate-500 text-center">
              Not charging the developer? Approve the foreman directly below.
            </p>
          )}
        </div>
      )}

      {/* Admin actions — pending only */}
      {group.status === 'pending' && onAction && (
        <div className="p-4 space-y-2">
          {!rejectMode ? (
            <div className="flex gap-2">
              <button
                disabled={busy || !canApproveForeman}
                onClick={() => startTransition(() => onAction(ids, 'approved'))}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-green-600 hover:bg-green-700
                           text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve Foreman
              </button>
              <button
                disabled={busy}
                onClick={() => setRejectMode(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-red-50 hover:bg-red-100
                           text-red-600 text-sm font-semibold rounded-xl border border-red-200 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Reject All
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection (sent to foreman)..."
                rows={2}
                className="w-full px-3 py-2 border border-red-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <button
                  disabled={busy || !reason.trim()}
                  onClick={() => startTransition(() => onAction(ids, 'rejected', reason))}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300
                             text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => { setRejectMode(false); setReason('') }}
                  className="px-4 py-2 bg-gray-100 text-slate-700 text-sm font-medium rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Tab = 'pending' | 'approved' | 'rejected'

export default function VariationList({
  pending, approved, rejected,
}: {
  pending:  Claim[]
  approved: Claim[]
  rejected: Claim[]
}) {
  const [tab,    setTab]    = useState<Tab>('pending')
  const [allClaims, setAll] = useState({ pending, approved, rejected })
  const [error,  setError]  = useState<string | null>(null)
  const router = useRouter()

  const groups = buildGroups(allClaims[tab])

  const handleAction = async (ids: string[], status: string, reason?: string) => {
    setError(null)
    try {
      const res = await fetch('/api/variations/batch', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids, status, admin_rejection_reason: reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Action failed')

      setAll((prev) => {
        const moved = prev.pending.filter((c) => ids.includes(c.id))
        const updatedMoved = moved.map((c) => ({
          ...c, status, admin_rejection_reason: reason ?? null,
        }))
        return {
          pending:  prev.pending.filter((c) => !ids.includes(c.id)),
          approved: status === 'approved' ? [...updatedMoved, ...prev.approved] : prev.approved,
          rejected: status === 'rejected' ? [...updatedMoved, ...prev.rejected] : prev.rejected,
        }
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process action. Please try again.')
    }
  }

  const handleCreateDeveloper = async (ids: string[]) => {
    setError(null)
    try {
      const res = await fetch('/api/admin/variations/developer/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not create developer draft.')
      router.push(`/admin/variations/developer/${json.developerSubmissionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create developer draft.')
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending',  label: 'Pending',  count: buildGroups(allClaims.pending).length  },
    { key: 'approved', label: 'Approved', count: buildGroups(allClaims.approved).length },
    { key: 'rejected', label: 'Rejected', count: buildGroups(allClaims.rejected).length },
  ]

  return (
    <div className="space-y-4">
      <div className="flex bg-gray-100 rounded-xl p-1">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {tab} variations</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              onAction={tab === 'pending' ? handleAction : undefined}
              onCreateDeveloper={tab === 'pending' ? handleCreateDeveloper : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { Clock, ChevronRight } from 'lucide-react'

type Submission = {
  id: string
  description: string
  status: string
  payment_status: string
  foreman_total: number
  developer_total: number
  submitted_to_developer_at: string | null
  paid_at: string | null
  created_at: string
  sites: { name: string } | null
  foremen: { first_name: string; surname: string } | null
}

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

export default function DeveloperSubmissionList({ submissions }: { submissions: Submission[] }) {
  const drafts     = submissions.filter((s) => s.status === 'draft')
  const awaiting   = submissions.filter((s) => s.status === 'submitted')
  const agreed     = submissions.filter((s) => s.status === 'agreed')
  const paid       = submissions.filter((s) => s.status === 'paid')

  const sections = [
    { title: 'Draft — adjust before sending to developer', items: drafts, empty: 'No drafts' },
    { title: 'Awaiting developer agreement', items: awaiting, empty: 'None awaiting agreement' },
    { title: 'Agreed — foreman can be approved', items: agreed, empty: 'None agreed yet' },
    { title: 'Paid by developer', items: paid, empty: 'No paid variations yet' },
  ]

  if (submissions.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No developer variations yet.</p>
        <p className="text-xs mt-2">Approve a foreman variation from Pending, or use Prepare developer variation while it is still pending.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sections.map(({ title, items, empty }) => (
        <div key={title} className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">{empty}</p>
          ) : (
            items.map((s) => (
              <Link
                key={s.id}
                href={`/admin/variations/developer/${s.id}`}
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {s.foremen?.first_name} {s.foremen?.surname}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {s.sites?.name} · {s.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">Developer total</p>
                  <p className="font-bold text-orange-600">{fmt(s.developer_total)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

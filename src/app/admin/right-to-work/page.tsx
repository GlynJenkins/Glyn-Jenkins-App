import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadRightToWorkRegister } from '@/lib/workers/load-right-to-work-register'
import type { RtwRegisterFilter } from '@/lib/workers/load-right-to-work-register'
import RightToWorkRegisterTable from './_components/RightToWorkRegisterTable'

export const dynamic = 'force-dynamic'

function parseFilter(raw: string | string[] | undefined): RtwRegisterFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  const allowed: RtwRegisterFilter[] = [
    'all', 'verified', 'pending', 'follow_up', 'expiring', 'expired',
  ]
  if (value && (allowed as string[]).includes(value)) {
    return value as RtwRegisterFilter
  }
  return 'all'
}

export default async function RightToWorkRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  await requireAdminAccess()
  const params = await searchParams
  const initialFilter = parseFilter(params.filter)

  const supabase = createServiceClient()
  let rows: Awaited<ReturnType<typeof loadRightToWorkRegister>>['rows'] = []
  let summary: Awaited<ReturnType<typeof loadRightToWorkRegister>>['summary'] = {
    total: 0, verified: 0, pending: 0, followUp: 0, expiringSoon: 0, expired: 0,
  }
  let loadError: string | null = null

  try {
    const bundle = await loadRightToWorkRegister(supabase)
    rows = bundle.rows
    summary = bundle.summary
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Could not load register.'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">Right to Work Register</h1>
            <p className="text-slate-400 text-sm mt-1">
              Audit-ready checks · who verified, when, and re-check dates
            </p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5 pb-16">
        {loadError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError}
          </div>
        ) : (
          <RightToWorkRegisterTable
            rows={rows}
            summary={summary}
            initialFilter={initialFilter}
          />
        )}
      </main>
    </div>
  )
}

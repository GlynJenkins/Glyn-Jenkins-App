import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadWorkerMatrix } from '@/lib/workers/load-worker-matrix'
import WorkerMatrixTable from './_components/WorkerMatrixTable'

export const dynamic = 'force-dynamic'

export default async function WorkerMatrixPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  const { active, inactive, pendingCount } = await loadWorkerMatrix(supabase)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">Worker Matrix</h1>
            <p className="text-slate-400 text-sm mt-1">
              Name, role, age, phone &amp; home address · Active and Inactive kept separate
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
        <WorkerMatrixTable
          active={active}
          inactive={inactive}
          pendingCount={pendingCount}
          showExport
        />
      </main>
    </div>
  )
}

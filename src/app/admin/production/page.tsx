import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchProductionCostReport } from '@/lib/production/queries'
import ProductionCostDashboard from './_components/ProductionCostDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminProductionPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  let report: Awaited<ReturnType<typeof fetchProductionCostReport>> | null = null
  let error: string | null = null

  try {
    report = await fetchProductionCostReport(supabase)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load production costs.'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Production Cost</h1>
            <p className="text-slate-400 text-xs mt-1">
              Monthly wages by site · from approved booking in
            </p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-800">
            {error}
          </div>
        ) : report ? (
          <ProductionCostDashboard report={report} />
        ) : null}
      </div>
    </div>
  )
}

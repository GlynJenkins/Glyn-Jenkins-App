import { createServiceClient } from '@/lib/supabase/server'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { canAccessAdmin, isSupervisorRole } from '@/lib/worker-access'
import LogoutButton from './_components/LogoutButton'
import AdminDashboardNav from './_components/AdminDashboardNav'
import { countPendingHolidayRequests } from '@/lib/holidays/queries'
import { loadTrainingMatrix } from '@/lib/training/load-training-matrix'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { worker } = await requireManagementAreaAccess()

  const isFullAdmin = !worker || canAccessAdmin(worker.role)
  const restricted  = !!worker && isSupervisorRole(worker.role)

  const supabase = createServiceClient()

  let pendingWorkerCount = 0
  let pendingClaimCount = 0
  let pendingVariationCount = 0
  let pendingHolidayCount = 0
  let expiredCscsCount = 0

  // Supervisors must not load admin-only summary data they cannot act on.
  if (isFullAdmin) {
    const { count: workers } = await supabase
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_verification')
    pendingWorkerCount = workers ?? 0

    const { count: claims } = await supabase
      .from('claim_periods')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingClaimCount = claims ?? 0

    const { data: pendingVariationRows } = await supabase
      .from('variation_claims')
      .select('id, photo_urls')
      .eq('status', 'pending')

    pendingVariationCount = new Set(
      (pendingVariationRows ?? []).map((v) => (v.photo_urls ?? [])[0] ?? v.id)
    ).size

    try {
      pendingHolidayCount = await countPendingHolidayRequests()
    } catch {
      // table may not exist until migration runs
    }

    try {
      const { summary } = await loadTrainingMatrix()
      expiredCscsCount = summary.expired
    } catch {
      // columns may not exist until migration runs
    }
  }

  const navCounts = {
    pendingClaims:     pendingClaimCount,
    pendingVariations: pendingVariationCount,
    pendingHolidays:   pendingHolidayCount,
    pendingWorkers:    pendingWorkerCount,
    expiredCscs:       expiredCscsCount,
  }

  const displayName = worker
    ? `${worker.first_name} ${worker.surname}`
    : 'Admin'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-8">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-2xl font-bold text-white mt-0.5">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Signed in as {displayName}</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-5 pb-16">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <AdminDashboardNav counts={navCounts} restricted={restricted} />
        </section>
      </main>
    </div>
  )
}

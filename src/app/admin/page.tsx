import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import WorkerList from './_components/WorkerList'
import LogoutButton from './_components/LogoutButton'
import AdminDashboardNav from './_components/AdminDashboardNav'
import { countPendingHolidayRequests } from '@/lib/holidays/queries'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { worker } = await requireAdminAccess()

  const supabase = createServiceClient()
  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, first_name, surname, phone, utr_number, tax_type, role, status, has_personal_insurance, cscs_card_url, id_document_url, insurance_certificate_url, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Admin] Failed to fetch workers:', error.message)
  }

  const workerRows = workers ?? []
  const pendingWorkerCount = workerRows.filter((w) => w.status === 'pending_verification').length

  const { count: pendingClaimCount } = await supabase
    .from('claim_periods')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { data: pendingVariationRows } = await supabase
    .from('variation_claims')
    .select('id, photo_urls')
    .eq('status', 'pending')

  const pendingVariationCount = new Set(
    (pendingVariationRows ?? []).map((v) => (v.photo_urls ?? [])[0] ?? v.id)
  ).size

  let pendingHolidayCount = 0
  try {
    pendingHolidayCount = await countPendingHolidayRequests()
  } catch {
    // table may not exist until migration runs
  }

  const navCounts = {
    pendingClaims:     pendingClaimCount ?? 0,
    pendingVariations: pendingVariationCount,
    pendingHolidays:   pendingHolidayCount,
    pendingWorkers:    pendingWorkerCount,
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

      <main className="max-w-5xl mx-auto px-4 -mt-5 pb-16 space-y-10">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <AdminDashboardNav counts={navCounts} />
        </section>

        <section id="workers" className="scroll-mt-6">
          <div className="flex items-end justify-between gap-3 mb-4 px-0.5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Workers</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Inductions, profiles &amp; activation
              </p>
            </div>
            {pendingWorkerCount > 0 && (
              <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                {pendingWorkerCount} pending
              </span>
            )}
          </div>
          <WorkerList initialWorkers={workerRows} />
        </section>
      </main>
    </div>
  )
}

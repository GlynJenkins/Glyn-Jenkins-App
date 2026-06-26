import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { Building2, FileUp, ClipboardCheck, Settings, Sun, Droplets, TrendingUp } from 'lucide-react'
import WorkerList from './_components/WorkerList'
import LogoutButton from './_components/LogoutButton'
import { countPendingHolidayRequests } from '@/lib/holidays/queries'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, first_name, surname, phone, utr_number, tax_type, role, status, has_personal_insurance, cscs_card_url, id_document_url, insurance_certificate_url, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Admin] Failed to fetch workers:', error.message)
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <LogoutButton />
        </div>

        {/* Quick nav — row 1 */}
        <div className="flex flex-wrap gap-2 mt-4 max-w-lg mx-auto">
          <Link
            href="/admin/sites"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Building2 className="w-4 h-4 text-orange-400" />
            Manage Sites
          </Link>
          <Link
            href="/admin/variations"
            className="relative flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <FileUp className="w-4 h-4 text-orange-400" />
            Variations
            {pendingVariationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingVariationCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/claims"
            className="relative flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            Claims
            {(pendingClaimCount ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingClaimCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/settings"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Settings className="w-4 h-4 text-orange-400" />
            Settings
          </Link>
          <Link
            href="/admin/holidays"
            className="relative flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Sun className="w-4 h-4 text-orange-400" />
            Holidays
            {pendingHolidayCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingHolidayCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/jetwash"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Droplets className="w-4 h-4 text-orange-400" />
            Jetwash
          </Link>
          <Link
            href="/admin/production"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <TrendingUp className="w-4 h-4 text-orange-400" />
            Production
          </Link>
        </div>
      </header>

      {/* Worker list */}
      <div className="pt-5">
        <WorkerList initialWorkers={workers ?? []} />
      </div>
    </div>
  )
}

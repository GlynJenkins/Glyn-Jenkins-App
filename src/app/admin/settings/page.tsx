import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link                    from 'next/link'
import SettingsForm            from './_components/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('admin_settings')
    .select('global_admin_fee, insurance_fee, holiday_day_rate, college_day_rate, pay_cycle_period_start, pay_cycle_pay_day')
    .limit(1)
    .maybeSingle()

  const adminFee     = settings?.global_admin_fee ?? 6
  const insuranceFee = settings?.insurance_fee    ?? 3
  const holidayRate  = settings?.holiday_day_rate ?? 50
  const collegeRate  = settings?.college_day_rate ?? 50
  const periodStart  = settings?.pay_cycle_period_start?.slice(0, 10) ?? '2026-06-15'
  const payDay       = settings?.pay_cycle_pay_day?.slice(0, 10)      ?? '2026-07-03'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Admin Settings</h1>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto space-y-4">
        <Link
          href="/admin/settings/company"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-orange-200 transition-colors"
        >
          <div>
            <p className="font-semibold text-slate-900">Company & document branding</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Logo, address, VAT — plus per-site details on each site page
            </p>
          </div>
          <span className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl shrink-0">
            Edit
          </span>
        </Link>

        <SettingsForm
          initialAdminFee={adminFee}
          initialInsuranceFee={insuranceFee}
          initialHolidayRate={holidayRate}
          initialCollegeRate={collegeRate}
          initialPeriodStart={periodStart}
          initialPayDay={payDay}
        />
      </div>
    </div>
  )
}

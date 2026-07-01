import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  buildWagesFortnightTabs,
  defaultWagesPeriodKey,
  loadWagesRegisterResult,
} from '@/lib/claims/load-wages-register'
import { fetchPayCycleSettings } from '@/lib/fortnight'
import WagesRegisterTable from './_components/WagesRegisterTable'

export const dynamic = 'force-dynamic'

export default async function AdminClaimsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  let registerRows: Awaited<ReturnType<typeof loadWagesRegisterResult>>['rows'] = []
  let niColumnAvailable = true
  let error: string | null = null
  let periodTabs: ReturnType<typeof buildWagesFortnightTabs> = []
  let defaultPeriodKey = 'all'

  const { count: pendingCount } = await supabase
    .from('claim_periods')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  try {
    const [result, payCycleSettings] = await Promise.all([
      loadWagesRegisterResult(supabase),
      fetchPayCycleSettings(supabase),
    ])
    registerRows = result.rows
    niColumnAvailable = result.niColumnAvailable
    periodTabs = buildWagesFortnightTabs(payCycleSettings, registerRows)
    defaultPeriodKey = defaultWagesPeriodKey(periodTabs)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load wages register.'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Booking In</h1>
            <p className="text-slate-400 text-xs mt-1">Wages register</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto space-y-4">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <>
            {!niColumnAvailable && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
                <p className="font-semibold">Database update needed</p>
                <p className="text-xs mt-1 leading-relaxed">
                  Run this in Supabase → SQL Editor to enable apprentice NI and editable tax:
                </p>
                <pre className="mt-2 text-[11px] bg-white border border-amber-100 rounded-xl p-3 overflow-x-auto">
{`ALTER TABLE worker_cis_ledger
  ADD COLUMN IF NOT EXISTS national_insurance NUMERIC(10,2) NOT NULL DEFAULT 0;`}
                </pre>
              </div>
            )}

            {(pendingCount ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs text-amber-700 uppercase tracking-wide font-medium">
                  Awaiting approval
                </p>
                <p className="text-2xl font-bold text-amber-900 mt-1">{pendingCount}</p>
                <Link
                  href="/admin/claims/pending"
                  className="text-xs text-amber-700 underline mt-1 inline-block"
                >
                  Review pending claims →
                </Link>
              </div>
            )}

            <WagesRegisterTable
              rows={registerRows}
              periodTabs={periodTabs}
              defaultPeriodKey={defaultPeriodKey}
              pendingCount={pendingCount ?? 0}
              niColumnAvailable={niColumnAvailable}
            />
          </>
        )}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import ClaimApprovalList from '../_components/ClaimApprovalList'
import { dedupeClaimsByForemanPeriod } from '@/lib/claims/dedupe-period-claims'
import {
  buildClaimFortnightTabs,
  defaultWagesPeriodKey,
} from '@/lib/claims/load-wages-register'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'
import { fetchPayCycleSettings } from '@/lib/fortnight'

export const dynamic = 'force-dynamic'

export default async function PendingClaimsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: rawClaims } = await supabase
    .from('claim_periods')
    .select(`
      id, status, pool_total, pool_items, period_start, period_end,
      submitted_at, approved_at, rejected_at, rejection_reason,
      foreman_id, site_id,
      sites ( id, name ),
      claim_allocations ( id, worker_id, gross_amount )
    `)
    .in('status', ['pending', 'approved', 'rejected'])
    .order('submitted_at', { ascending: false })

  const claims = await Promise.all((rawClaims ?? []).map(async (claim) => {
    const { data: foreman } = await supabase
      .from('workers')
      .select('id, first_name, surname, email, phone')
      .eq('id', claim.foreman_id)
      .maybeSingle()

    const enrichedAllocations = await Promise.all(
      (claim.claim_allocations ?? []).map(async (alloc) => {
        const { data: worker } = await supabase
          .from('workers')
          .select('id, first_name, surname, role, tax_type, has_personal_insurance')
          .eq('id', alloc.worker_id)
          .maybeSingle()
        return {
          ...alloc,
          workers: worker
            ? { ...worker, has_own_insurance: worker.has_personal_insurance ?? false }
            : null,
        }
      }),
    )

    return { ...claim, workers: foreman, claim_allocations: enrichedAllocations }
  }))

  const { adminFee, insuranceFee } = await fetchPayFeeSettings()
  const payCycleSettings = await fetchPayCycleSettings(supabase)
  const deduped = dedupeClaimsByForemanPeriod(claims ?? [])

  const pending  = deduped.filter((c) => c.status === 'pending')
  const approved = deduped.filter((c) => c.status === 'approved')
  const rejected = deduped.filter((c) => c.status === 'rejected')
  const approvedPeriodTabs = buildClaimFortnightTabs(payCycleSettings, approved)
  const defaultApprovedPeriodKey = defaultWagesPeriodKey(approvedPeriodTabs)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Pending claims</h1>
            <p className="text-slate-400 text-xs mt-1">Review, approve, or browse past claims</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin/claims"
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Register
            </Link>
            <Link
              href="/admin"
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <ClaimApprovalList
          pending={pending as never}
          approved={approved as never}
          rejected={rejected as never}
          approvedPeriodTabs={approvedPeriodTabs}
          defaultApprovedPeriodKey={defaultApprovedPeriodKey}
          adminFee={adminFee}
          insuranceFee={insuranceFee}
        />
      </div>
    </div>
  )
}

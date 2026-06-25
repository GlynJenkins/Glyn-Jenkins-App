import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import ClaimApprovalList from './_components/ClaimApprovalList'
import { dedupeClaimsByForemanPeriod } from '@/lib/claims/dedupe-period-claims'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'

export const dynamic = 'force-dynamic'

export default async function AdminClaimsPage() {
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
    .order('submitted_at', { ascending: false })

  // Enrich with foreman name + worker details separately to avoid FK hint issues
  const claims = await Promise.all((rawClaims ?? []).map(async (claim) => {
    // Foreman
    const { data: foreman } = await supabase
      .from('workers')
      .select('id, first_name, surname, email, phone')
      .eq('id', claim.foreman_id)
      .maybeSingle()

    // Worker details for each allocation
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
            ? {
                ...worker,
                has_own_insurance: worker.has_personal_insurance ?? false,
              }
            : null,
        }
      })
    )

    return { ...claim, workers: foreman, claim_allocations: enrichedAllocations }
  }))

  const { adminFee, insuranceFee } = await fetchPayFeeSettings()

  const deduped = dedupeClaimsByForemanPeriod(claims ?? [])

  const pending  = deduped.filter((c) => c.status === 'pending')
  const approved = deduped.filter((c) => c.status === 'approved')
  const rejected = deduped.filter((c) => c.status === 'rejected')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Claim Approvals</h1>
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

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <ClaimApprovalList
          pending={pending as never}
          approved={approved as never}
          rejected={rejected as never}
          adminFee={adminFee}
          insuranceFee={insuranceFee}
        />
      </div>
    </div>
  )
}

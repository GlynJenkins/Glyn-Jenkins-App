import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { getCurrentFortnight, toLocalDateString } from '@/lib/fortnight'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'
import { loadForemanClaim } from '@/lib/claims/load-foreman-claim'
import PortalHeader from '@/components/PortalHeader'
import ForemanClaimPageClient from './_components/ForemanClaimPageClient'

export const dynamic = 'force-dynamic'

export default async function ForemanClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const { claimId } = await params
  const { worker } = await requireForemanAccess()
  const supabase = createServiceClient()

  const claim = await loadForemanClaim(supabase, claimId, worker.id)
  if (!claim) notFound()

  const [fees, period] = await Promise.all([
    fetchPayFeeSettings(),
    getCurrentFortnight(supabase),
  ])

  const isCurrentPeriod =
    claim.period_start === toLocalDateString(period.start) &&
    claim.period_end === toLocalDateString(period.end)
  const canWithdraw =
    claim.status === 'pending' && isCurrentPeriod && !period.isLocked

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="flex items-center justify-between max-w-lg mx-auto gap-3">
          <div className="min-w-0">
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white truncate">
              {claim.period_start && claim.period_end
                ? new Date(claim.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  + ' – '
                  + new Date(claim.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'My claim'}
            </h1>
          </div>
          <Link
            href="/foreman"
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <ForemanClaimPageClient
          claim={claim}
          adminFee={fees.adminFee}
          insuranceFee={fees.insuranceFee}
          canWithdraw={canWithdraw}
        />
      </div>
    </div>
  )
}

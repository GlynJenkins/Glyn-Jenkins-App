import { createServiceClient }  from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { getCurrentFortnight, toLocalDateString } from '@/lib/fortnight'
import LogoutButton             from '../admin/_components/LogoutButton'
import ForemanDashboard         from './_components/ForemanDashboard'
import UnseenSiteAuditsModal    from './_components/UnseenSiteAuditsModal'
import {
  filterPastForemanClaims,
  foremanClaimPeriodKey,
  loadForemanClaimHistory,
} from '@/lib/claims/load-foreman-claim-history'
import { fetchOpenSnagCountBySite } from '@/lib/qa/snags'
import PortalHeader             from '@/components/PortalHeader'

export const dynamic = 'force-dynamic'

export default async function ForemanPage() {
  const { worker } = await requireForemanAccess()

  const supabase = createServiceClient()
  const { data: assignments } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', worker.id)

  const siteIds = assignments?.map((a) => a.site_id) ?? []

  let sites: { id: string; name: string; address: string | null; is_active: boolean }[] = []
  if (siteIds.length > 0) {
    const { data } = await supabase
      .from('sites')
      .select('id, name, address, is_active')
      .in('id', siteIds)
      .order('name')
    sites = data ?? []
  }

  // ── Current claim status (single per foreman per period) ─────────
  const period = await getCurrentFortnight(supabase)

  let currentClaim: { status: string; claimId: string } | null = null
  const { data: claimRow } = await supabase
    .from('claim_periods')
    .select('id, status')
    .eq('foreman_id', worker.id)
    .eq('period_start', toLocalDateString(period.start))
    .eq('period_end', toLocalDateString(period.end))
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (claimRow) currentClaim = { status: claimRow.status, claimId: claimRow.id }

  const currentPeriodKey = foremanClaimPeriodKey(
    toLocalDateString(period.start),
    toLocalDateString(period.end),
  )
  const allClaims = await loadForemanClaimHistory(supabase, worker.id)
  const pastClaims = filterPastForemanClaims(allClaims, currentPeriodKey)

  // ── Pending variation count per site (one submission = one count, not per worker line) ──
  const variationCountMap: Record<string, number> = {}
  if (siteIds.length > 0) {
    const { data: variations } = await supabase
      .from('variation_claims')
      .select('site_id, status, photo_urls, id')
      .in('site_id', siteIds)
      .eq('status', 'pending')
    const seenBySite = new Map<string, Set<string>>()
    for (const v of variations ?? []) {
      const key = (v.photo_urls ?? [])[0] ?? v.id
      if (!seenBySite.has(v.site_id)) seenBySite.set(v.site_id, new Set())
      seenBySite.get(v.site_id)!.add(key)
    }
    for (const [siteId, keys] of seenBySite) {
      variationCountMap[siteId] = keys.size
    }
  }

  // ── Open QA snag counts per site ─────────────────────────────
  let openSnagCountMap: Record<string, number> = {}
  if (siteIds.length > 0) {
    try {
      openSnagCountMap = await fetchOpenSnagCountBySite(supabase, siteIds)
    } catch {
      // table may not exist until migration runs
    }
  }

  // ── Site audit badges + unseen modal data ─────────────────────
  const auditMeta: Record<string, { latestDate: string | null; hasUnseen: boolean }> = {}
  if (siteIds.length > 0) {
    const { data: audits } = await supabase
      .from('site_audits')
      .select('id, site_id, audit_date')
      .in('site_id', siteIds)
      .eq('status', 'completed')
      .order('audit_date', { ascending: false })

    const auditIds = (audits ?? []).map((a) => a.id)
    const { data: views } = auditIds.length
      ? await supabase
          .from('site_audit_views')
          .select('audit_id')
          .eq('worker_id', worker.id)
          .in('audit_id', auditIds)
      : { data: [] as { audit_id: string }[] }
    const seen = new Set((views ?? []).map((v) => v.audit_id))

    for (const siteId of siteIds) {
      const siteAudits = (audits ?? []).filter((a) => a.site_id === siteId)
      auditMeta[siteId] = {
        latestDate: siteAudits[0]?.audit_date ?? null,
        hasUnseen: siteAudits.some((a) => !seen.has(a.id)),
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">
              {worker.first_name} {worker.surname}
            </h1>
            <p className="text-slate-400 text-sm">Foreman</p>
          </div>
          <LogoutButton />
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <UnseenSiteAuditsModal />
        <ForemanDashboard
          sites={sites}
          currentClaim={currentClaim}
          pastClaims={pastClaims}
          variationCountMap={variationCountMap}
          auditMeta={auditMeta}
          openSnagCountMap={openSnagCountMap}
          period={{
            label:         period.label,
            payLabel:       period.payLabel,
            isLocked:      period.isLocked,
            isGracePeriod:  period.isGracePeriod,
            lockTime:       period.lockTime.toISOString(),
            start:         period.start.toISOString(),
            end:           period.end.toISOString(),
          }}
        />
      </div>
    </div>
  )
}

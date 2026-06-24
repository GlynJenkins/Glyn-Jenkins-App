import { createServiceClient }  from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { getCurrentFortnight }   from '@/lib/fortnight'
import MultiSiteClaimBuilder     from './_components/MultiSiteClaimBuilder'

export const dynamic = 'force-dynamic'

export default async function MultiSiteClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ cells?: string; gang?: string; days?: string }>
}) {
  const { cells: cellsParam, gang: gangParam, days: daysParam } = await searchParams

  const { worker: foreman } = await requireForemanAccess()

  const supabase = createServiceClient()

  // ── All assigned active sites ─────────────────────────────────────────
  const { data: assignments } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foreman.id)

  const siteIds = assignments?.map((a) => a.site_id) ?? []

  let sites: { id: string; name: string }[] = []
  if (siteIds.length > 0) {
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .in('id', siteIds)
      .eq('is_active', true)
      .order('name')
    sites = data ?? []
  }

  // ── Parse selected cells from URL (all sites mixed) ───────────────────
  const amountMap = new Map<string, number>()
  if (cellsParam) {
    for (const part of cellsParam.split(',')) {
      const [id, penceStr] = part.trim().split(':')
      if (id && penceStr) amountMap.set(id, parseInt(penceStr) / 100)
    }
  }
  const selectedCellIds = Array.from(amountMap.keys())

  type SelectedLift = {
    id:            string
    plotNumber:    string
    stageName:     string
    contractValue: number
    fullValue:     number
    pct:           number
    siteId:        string
  }

  let allSelectedLifts: SelectedLift[] = []
  if (selectedCellIds.length > 0) {
    const { data: rawCells } = await supabase
      .from('price_grid')
      .select('id, plot_number, stage_id, contract_value, site_id, site_stages(stage_name)')
      .in('id', selectedCellIds)

    allSelectedLifts = (rawCells ?? []).map((c) => {
      const stage       = c.site_stages as { stage_name: string } | null
      const fullValue   = c.contract_value ?? 0
      const claimAmount = amountMap.get(c.id) ?? fullValue
      const pct         = fullValue > 0 ? Math.round(claimAmount / fullValue * 100) : 100
      return {
        id:            c.id,
        plotNumber:    c.plot_number,
        stageName:     stage?.stage_name ?? '—',
        contractValue: claimAmount,
        fullValue,
        pct,
        siteId:        c.site_id,
      }
    })
  }

  // Group lifts by siteId
  const siteLifts: Record<string, SelectedLift[]> = {}
  for (const lift of allSelectedLifts) {
    if (!siteLifts[lift.siteId]) siteLifts[lift.siteId] = []
    siteLifts[lift.siteId].push(lift)
  }

  // ── Approved variations not yet claimed — from ALL assigned sites ─────
  type VariationLine  = { id: string; workerName: string; amount: number }
  type VariationGroup = { groupKey: string; description: string; lines: VariationLine[]; total: number }

  const variationGroups: VariationGroup[] = []
  if (siteIds.length > 0) {
    const { data: rawVariations } = await supabase
      .from('variation_claims')
      .select(`
        id, description, total_amount, photo_urls,
        workers!variation_claims_worker_id_fkey(first_name, surname, role)
      `)
      .in('site_id', siteIds)
      .eq('status', 'approved')
      .is('claimed_in_period_id', null)
      .order('created_at', { ascending: true })

    const groupMap = new Map<string, VariationGroup>()
    for (const v of rawVariations ?? []) {
      const key = (v.photo_urls ?? [])[0] ?? v.id
      const w   = v.workers as { first_name: string; surname: string } | null
      if (!groupMap.has(key)) {
        groupMap.set(key, { groupKey: key, description: v.description ?? 'Variation', lines: [], total: 0 })
      }
      const g = groupMap.get(key)!
      g.lines.push({ id: v.id, workerName: w ? `${w.first_name} ${w.surname}` : 'Worker', amount: v.total_amount ?? 0 })
      g.total += v.total_amount ?? 0
    }
    variationGroups.push(...groupMap.values())
  }

  // ── Admin day rates ───────────────────────────────────────────────────
  const { data: adminSettings } = await supabase
    .from('admin_settings')
    .select('holiday_day_rate, college_day_rate')
    .limit(1)
    .maybeSingle()

  const holidayDayRate = adminSettings?.holiday_day_rate ?? 50
  const collegeDayRate = adminSettings?.college_day_rate ?? 50

  // ── Active workers ────────────────────────────────────────────────────
  const { data: workers } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .in('role', ['foreman', 'bricklayer', 'labourer', 'apprentice'])
    .eq('status', 'active')
    .order('surname')

  // ── Apprentice holiday balances ───────────────────────────────────────
  const apprentices = (workers ?? []).filter((w) => w.role === 'apprentice')
  const holidayRemaining: Record<string, number> = {}
  for (const a of apprentices) {
    const { data: ledger } = await supabase
      .from('apprentice_holiday_ledger')
      .select('days')
      .eq('worker_id', a.id)
      .eq('day_type', 'holiday')
    const used = (ledger ?? []).reduce((sum, r) => sum + (r.days ?? 0), 0)
    holidayRemaining[a.id] = Math.max(0, 28 - used)
  }

  // ── Initial gang from URL ─────────────────────────────────────────────
  const initialGang = gangParam
    ? gangParam.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const period = await getCurrentFortnight(supabase)

  return (
    <MultiSiteClaimBuilder
      foreman={{ id: foreman.id, name: `${foreman.first_name} ${foreman.surname}` }}
      sites={sites}
      siteLifts={siteLifts}
      variationGroups={variationGroups}
      workers={workers ?? []}
      holidayRemaining={holidayRemaining}
      holidayDayRate={holidayDayRate}
      collegeDayRate={collegeDayRate}
      period={{
        label:    period.label,
        payLabel:  period.payLabel,
        isLocked: period.isLocked,
        isGracePeriod: period.isGracePeriod,
        lockTime: period.lockTime.toISOString(),
        start:    period.start.toISOString(),
        end:      period.end.toISOString(),
      }}
      initialGang={initialGang}
      initialDays={daysParam ?? ''}
    />
  )
}

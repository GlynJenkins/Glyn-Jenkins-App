import { createServiceClient }   from '@/lib/supabase/server'
import { requireForemanAccess }  from '@/lib/auth/portal-access'
import { notFound }    from 'next/navigation'
import { getCurrentFortnight }   from '@/lib/fortnight'
import ClaimBuilder              from './_components/ClaimBuilder'
import { loadForemanClaimableVariations } from '@/lib/variations/load-foreman-claimable-variations'
import { relationOne }           from '@/lib/supabase/normalize-relations'

export const dynamic = 'force-dynamic'

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params:       Promise<{ siteId: string }>
  searchParams: Promise<{ cells?: string; gang?: string; days?: string }>
}) {
  const { siteId }    = await params
  const { cells: cellsParam, gang: gangParam, days: daysParam } = await searchParams

  const { worker: foreman } = await requireForemanAccess()

  const supabase = createServiceClient()

  // ── Verify site assignment ────────────────────────────────────────────
  const { data: assignment } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foreman.id)
    .eq('site_id', siteId)
    .maybeSingle()
  if (!assignment) notFound()

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()
  if (!site) notFound()

  // ── Resolve pre-selected cells from URL (format: "cellId:penceAmount,…") ──
  // penceAmount is the claim amount in pence (integer) to avoid float issues
  const amountMap = new Map<string, number>()  // cellId → £ claim amount
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
    contractValue: number   // the partial claim amount (pence-converted)
    fullValue:     number   // original full contract value
    pct:           number   // approximate % for display
  }

  let selectedLifts: SelectedLift[] = []
  if (selectedCellIds.length > 0) {
    const { data: rawCells } = await supabase
      .from('price_grid')
      .select('id, plot_number, stage_id, contract_value, site_stages(stage_name)')
      .in('id', selectedCellIds)

    selectedLifts = (rawCells ?? []).map((c) => {
      const stage       = relationOne(c.site_stages as { stage_name: string } | { stage_name: string }[] | null)
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
      }
    })
  }

  // ── Approved variations not yet in a claim ────────────────────────────
  const variationGroups = await loadForemanClaimableVariations(foreman.id, [siteId])

  // ── Day rates from admin settings ────────────────────────────────────
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

  const period = await getCurrentFortnight(supabase)

  // Parse initial gang from URL ("workerId,workerId,…")
  const initialGang = gangParam
    ? gangParam.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <ClaimBuilder
      site={site}
      foreman={{ id: foreman.id, name: `${foreman.first_name} ${foreman.surname}` }}
      selectedLifts={selectedLifts}
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
      siteId={siteId}
      initialGang={initialGang}
      initialDays={daysParam ?? ''}
    />
  )
}

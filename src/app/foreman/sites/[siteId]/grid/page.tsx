import { createServiceClient }  from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { notFound }             from 'next/navigation'
import Link                     from 'next/link'
import { sortPlotNumbers } from '@/lib/sites/plot-order'
import ForemanGrid              from './_components/ForemanGrid'
import PortalHeader              from '@/components/PortalHeader'
import { fetchFiresockMetByPlot } from '@/lib/firesock/queries'

export const dynamic = 'force-dynamic'

export default async function ForemanSiteGridPage({
  params,
  searchParams,
}: {
  params:       Promise<{ siteId: string }>
  searchParams: Promise<{ cells?: string; gang?: string; days?: string }>
}) {
  const { siteId } = await params
  const { cells: cellsParam, gang: gangParam, days: daysParam } = await searchParams

  const { worker } = await requireForemanAccess()

  const supabase = createServiceClient()

  const { data: assignment } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', worker.id)
    .eq('site_id', siteId)
    .maybeSingle()
  if (!assignment) notFound()

  const [{ data: site }, { data: stages }, { data: cells }] = await Promise.all([
    supabase.from('sites').select('id, name, address').eq('id', siteId).maybeSingle(),
    supabase.from('site_stages').select('id, stage_name, stage_order').eq('site_id', siteId).order('stage_order'),
    (async () => {
      const allCells: {
        id: string; plot_number: string; stage_id: string
        contract_value: number | null; current_balance: number | null
        cell_color: string; override_note: string | null; total_claimed_pct: number
      }[] = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data: page } = await supabase
          .from('price_grid')
          .select('id, plot_number, stage_id, contract_value, current_balance, cell_color, override_note, total_claimed_pct')
          .eq('site_id', siteId)
          .range(from, from + PAGE - 1)
        if (!page || page.length === 0) break
        allCells.push(...page)
        if (page.length < PAGE) break
        from += PAGE
      }
      return { data: allCells }
    })(),
  ])

  if (!site) notFound()

  const sortedStages = [...(stages ?? [])].sort((a, b) => a.stage_order - b.stage_order)

  const plotNumbers = sortPlotNumbers(Array.from(new Set((cells ?? []).map((c) => c.plot_number))))

  // Separate the incoming cells param into this-site cells and other-sites cells.
  // The multi-site claim builder sends ALL selected cells (from every site) so this
  // grid can restore its own selections while preserving other sites' data for the return trip.
  const thisSiteCellIds = new Set((cells ?? []).map((c) => c.id))
  const thisSiteCellsParam = cellsParam
    ? cellsParam.split(',').filter((p) => thisSiteCellIds.has(p.split(':')[0])).join(',')
    : ''
  const otherSitesCellsParam = cellsParam
    ? cellsParam.split(',').filter((p) => { const id = p.split(':')[0]; return id && !thisSiteCellIds.has(id) }).join(',')
    : ''

  let firesockMetByPlot: Record<string, boolean> = {}
  try {
    const metMap = await fetchFiresockMetByPlot(siteId)
    firesockMetByPlot = Object.fromEntries(metMap)
  } catch {
    // table may not exist until migration runs
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-3">
          <div>
            <Link href="/foreman" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              ← My Sites
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">{site.name}</h1>
            {site.address && <p className="text-slate-400 text-sm">{site.address}</p>}
          </div>
        </div>
      </PortalHeader>

      <div className="px-4 pt-5 pb-24 max-w-5xl mx-auto">
        <ForemanGrid
          siteId={siteId}
          initialCells={thisSiteCellsParam}
          otherSitesCells={otherSitesCellsParam}
          initialGang={gangParam ?? ''}
          initialDays={daysParam ?? ''}
          stages={sortedStages.map((s) => ({ id: s.id, name: s.stage_name }))}
          plotNumbers={plotNumbers}
          cells={(cells ?? []).map((c) => ({
            id:              c.id,
            plotNumber:      c.plot_number,
            stageId:         c.stage_id,
            contractValue:   c.contract_value ?? 0,
            currentBalance:  c.current_balance ?? null,
            cellColor:       c.cell_color ?? 'white',
            overrideNote:    c.override_note ?? null,
            totalClaimedPct: c.total_claimed_pct ?? 0,
          }))}
          firesockMetByPlot={firesockMetByPlot}
        />
      </div>
    </div>
  )
}

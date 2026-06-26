import { createServiceClient } from '@/lib/supabase/server'

export type PlotDetail = {
  label: string
  value: string
}

type SiteStage = {
  id: string
  stage_name: string
  stage_order: number
}

/** First work stage — columns before this are plot descriptions on the spreadsheet. */
export function isFirstLiftStage(name: string): boolean {
  const n = name.toLowerCase().trim()
  return /1st\s*lift|first\s*lift|^lift\s*1/.test(n)
}

/** Column header is a garage field — separate tickable item, not a house description. */
export function isGarageStage(name: string): boolean {
  return name.toLowerCase().includes('garage')
}

export function descriptionStages(stages: SiteStage[]): SiteStage[] {
  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const liftIdx = sorted.findIndex((s) => isFirstLiftStage(s.stage_name))
  if (liftIdx <= 0) return []
  return sorted.slice(0, liftIdx).filter((s) => !isGarageStage(s.stage_name))
}

export function garageStages(stages: SiteStage[]): SiteStage[] {
  return stages.filter((s) => isGarageStage(s.stage_name))
}

/** True when a cell value is a price/number, not a garage description like "single garage". */
export function isNumericOnlyLabel(text: string): boolean {
  const cleaned = text.replace(/[£$€,\s]/g, '')
  if (!cleaned) return false
  return /^[\d.]+$/.test(cleaned) && !isNaN(parseFloat(cleaned))
}

/** Garage wash tick — text labels only (override_note). Ignores contract_value sums. */
export function garageCellLabel(
  contractValue: number | null,
  overrideNote: string | null
): string | null {
  const note = overrideNote?.trim()
  if (note) {
    if (isNumericOnlyLabel(note)) return null
    return note
  }
  // Numeric garage column values (e.g. 2759.03) are prices — not a wash item
  if (contractValue != null && contractValue !== 0) return null
  return null
}

export function cellText(contractValue: number | null, overrideNote: string | null): string | null {
  const note = overrideNote?.trim()
  if (note) return note
  if (contractValue != null && contractValue !== 0) {
    return Number.isInteger(contractValue)
      ? String(contractValue)
      : String(contractValue)
  }
  return null
}

export async function fetchPlotDetailsBySite(
  siteId: string
): Promise<Map<string, PlotDetail[]>> {
  const supabase = createServiceClient()
  const result = new Map<string, PlotDetail[]>()

  const { data: stages, error: stagesErr } = await supabase
    .from('site_stages')
    .select('id, stage_name, stage_order')
    .eq('site_id', siteId)
    .order('stage_order')

  if (stagesErr) throw stagesErr

  const descStages = descriptionStages(stages ?? [])
  if (descStages.length === 0) return result

  const stageIds = descStages.map((s) => s.id)
  const labelByStage = new Map(descStages.map((s) => [s.id, s.stage_name]))

  const PAGE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('price_grid')
      .select('plot_number, stage_id, contract_value, override_note')
      .eq('site_id', siteId)
      .in('stage_id', stageIds)
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      const text = cellText(row.contract_value, row.override_note)
      if (!text) continue

      const plot = row.plot_number?.trim()
      if (!plot) continue

      const label = labelByStage.get(row.stage_id) ?? 'Detail'
      const list = result.get(plot) ?? []
      list.push({ label, value: text })
      result.set(plot, list)
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  // Preserve column order from spreadsheet
  for (const [plot, details] of result) {
    const ordered = descStages
      .map((s) => details.find((d) => d.label === s.stage_name))
      .filter((d): d is PlotDetail => !!d)
    result.set(plot, ordered)
  }

  return result
}

export function formatPlotDetails(details: PlotDetail[]): string {
  return details.map((d) => d.value).join(' · ')
}

import { createServiceClient } from '@/lib/supabase/server'
import { garageCellLabel, garageStages } from '@/lib/jetwash/plot-descriptions'

export type WashItemKey = {
  plot_number: string
  item_type: 'house' | 'garage'
  item_label: string
}

export function washItemKeyString(item: WashItemKey): string {
  return `${item.plot_number}|${item.item_type}|${item.item_label}`
}

export function jetwashDisplayTitle(item: WashItemKey): string {
  if (item.item_type === 'garage') {
    return `Plot ${item.plot_number} · ${item.item_label}`
  }
  return `Plot ${item.plot_number}`
}

export async function fetchGarageWashItems(siteId: string): Promise<WashItemKey[]> {
  const supabase = createServiceClient()

  const { data: stages, error: stagesErr } = await supabase
    .from('site_stages')
    .select('id, stage_name, stage_order')
    .eq('site_id', siteId)

  if (stagesErr) throw stagesErr

  const gStages = garageStages(stages ?? [])
  if (gStages.length === 0) return []

  const stageIds = gStages.map((s) => s.id)
  const items: WashItemKey[] = []
  const seen = new Set<string>()
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
      const text = garageCellLabel(row.contract_value, row.override_note)
      if (!text) continue

      const plot = row.plot_number?.trim()
      if (!plot) continue

      const item: WashItemKey = {
        plot_number: plot,
        item_type:   'garage',
        item_label:  text,
      }
      const key = washItemKeyString(item)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  return items
}

export async function fetchAllWashItems(siteId: string, plotNumbers?: string[]): Promise<WashItemKey[]> {
  const supabase = createServiceClient()
  let plots = plotNumbers

  if (!plots) {
    const set = new Set<string>()
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('price_grid')
        .select('plot_number')
        .eq('site_id', siteId)
        .range(from, from + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const row of data) {
        const p = row.plot_number?.trim()
        if (p) set.add(p)
      }
      if (data.length < PAGE) break
      from += PAGE
    }
    plots = [...set]
  }

  const houseItems: WashItemKey[] = plots.map((plot_number) => ({
    plot_number,
    item_type:  'house' as const,
    item_label: '',
  }))

  const garageItems = await fetchGarageWashItems(siteId)
  return [...houseItems, ...garageItems]
}

import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  fetchPlotDetailsBySite,
  type PlotDetail,
} from '@/lib/jetwash/plot-descriptions'
import {
  fetchAllWashItems,
  jetwashDisplayTitle,
  washItemKeyString,
  type WashItemKey,
} from '@/lib/jetwash/wash-items'

export type JetwashPlotRow = {
  id: string
  site_id: string
  plot_number: string
  item_type: 'house' | 'garage'
  item_label: string
  title: string
  washed_at: string | null
  washed_by: string | null
  washer: { first_name: string; surname: string } | null
  details: PlotDetail[]
}

export type JetwashPayLogEntry = {
  id: string
  washed_at: string
  plot_number: string
  item_type: 'house' | 'garage'
  item_label: string
  title: string
  site_id: string
  site_name: string
  site_address: string | null
  washed_by: string | null
  washer: { first_name: string; surname: string } | null
  details: PlotDetail[]
}

export type JetwashPayLogDay = {
  date: string
  label: string
  entries: JetwashPayLogEntry[]
}

export type JetwashSiteSummary = {
  site_id: string
  name: string
  address: string | null
  total_plots: number
  washed_plots: number
}

function sortPlotNumbers(plots: string[]): string[] {
  return [...plots].sort((a, b) => {
    const na = parseFloat(a)
    const nb = parseFloat(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

export async function fetchDistinctPlotNumbers(siteId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const plots = new Set<string>()
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
      if (p) plots.add(p)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  return sortPlotNumbers([...plots])
}

function sortWashRows(rows: JetwashPlotRow[]): JetwashPlotRow[] {
  return [...rows].sort((a, b) => {
    const na = parseFloat(a.plot_number)
    const nb = parseFloat(b.plot_number)
    const plotCmp =
      !isNaN(na) && !isNaN(nb)
        ? na - nb
        : a.plot_number.localeCompare(b.plot_number, undefined, { numeric: true })
    if (plotCmp !== 0) return plotCmp
    if (a.item_type !== b.item_type) return a.item_type === 'house' ? -1 : 1
    return a.item_label.localeCompare(b.item_label)
  })
}

function dbItemKey(row: {
  plot_number: string
  item_type?: string | null
  item_label?: string | null
}): string {
  return washItemKeyString({
    plot_number: row.plot_number,
    item_type:   (row.item_type === 'garage' ? 'garage' : 'house'),
    item_label:  row.item_label ?? '',
  })
}

/** Mirror price_grid plots + garage columns into jetwash_plot_status. */
export async function syncJetwashPlots(
  siteId: string,
  plotNumbers?: string[]
): Promise<WashItemKey[]> {
  const supabase = createServiceClient()
  const items = await fetchAllWashItems(siteId, plotNumbers)

  const { data: existing, error: fetchErr } = await supabase
    .from('jetwash_plot_status')
    .select('id, plot_number, item_type, item_label, washed_at')
    .eq('site_id', siteId)

  if (fetchErr) throw fetchErr

  const expected = new Set(items.map(washItemKeyString))
  const existingByKey = new Map(
    (existing ?? []).map((r) => [dbItemKey(r), r])
  )

  const toInsert = items
    .filter((item) => !existingByKey.has(washItemKeyString(item)))
    .map((item) => ({
      site_id:     siteId,
      plot_number: item.plot_number,
      item_type:   item.item_type,
      item_label:  item.item_label,
    }))

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('jetwash_plot_status').insert(toInsert)
    if (insertErr) throw insertErr
  }

  const orphanIds = (existing ?? [])
    .filter((r) => !expected.has(dbItemKey(r)) && !r.washed_at)
    .map((r) => r.id)

  if (orphanIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('jetwash_plot_status')
      .delete()
      .in('id', orphanIds)
    if (deleteErr) throw deleteErr
  }

  return items
}

export async function fetchJetwashPlots(siteId: string): Promise<JetwashPlotRow[]> {
  await syncJetwashPlots(siteId)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jetwash_plot_status')
    .select(`
      id, site_id, plot_number, item_type, item_label, washed_at, washed_by,
      washer:workers!jetwash_plot_status_washed_by_fkey ( first_name, surname )
    `)
    .eq('site_id', siteId)

  if (error) throw error

  const detailsByPlot = await fetchPlotDetailsBySite(siteId)

  const rows: JetwashPlotRow[] = (data ?? []).map((row) => {
    const item: WashItemKey = {
      plot_number: row.plot_number,
      item_type:   row.item_type === 'garage' ? 'garage' : 'house',
      item_label:  row.item_label ?? '',
    }
    return {
      id:           row.id,
      site_id:      row.site_id,
      plot_number:  row.plot_number,
      item_type:    item.item_type,
      item_label:   item.item_label,
      title:        jetwashDisplayTitle(item),
      washed_at:    row.washed_at,
      washed_by:    row.washed_by,
      washer:       relationOne(row.washer) as { first_name: string; surname: string } | null,
      details:      item.item_type === 'house' ? (detailsByPlot.get(row.plot_number) ?? []) : [],
    }
  })

  return sortWashRows(rows)
}

export async function fetchJetwashSiteSummaries(activeOnly = true): Promise<JetwashSiteSummary[]> {
  const supabase = createServiceClient()

  let query = supabase.from('sites').select('id, name, address').order('name')
  if (activeOnly) query = query.eq('is_active', true)

  const { data: sites, error: sitesErr } = await query

  if (sitesErr) throw sitesErr

  const summaries: JetwashSiteSummary[] = []

  for (const site of sites ?? []) {
    const plots = await fetchJetwashPlots(site.id)
    summaries.push({
      site_id:      site.id,
      name:         site.name,
      address:      site.address,
      total_plots:  plots.length,
      washed_plots: plots.filter((p) => p.washed_at).length,
    })
  }

  return summaries
}

export async function markPlotWashedById(recordId: string, workerId: string | null) {
  const supabase = createServiceClient()

  const { data: existing, error: fetchErr } = await supabase
    .from('jetwash_plot_status')
    .select('id, washed_at')
    .eq('id', recordId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!existing) {
    return { ok: false as const, error: 'Item not found.' }
  }
  if (existing.washed_at) {
    return { ok: false as const, error: 'This item has already been jetwashed.' }
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('jetwash_plot_status')
    .update({
      washed_at:  now,
      washed_by:  workerId,
      updated_at: now,
    })
    .eq('id', recordId)
    .is('washed_at', null)

  if (updateErr) throw updateErr

  return { ok: true as const, washed_at: now }
}

/** @deprecated Use markPlotWashedById */
export async function markPlotWashed(
  siteId: string,
  plotNumber: string,
  workerId: string | null
) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('jetwash_plot_status')
    .select('id')
    .eq('site_id', siteId)
    .eq('plot_number', plotNumber)
    .eq('item_type', 'house')
    .eq('item_label', '')
    .maybeSingle()

  if (!data) return { ok: false as const, error: 'Plot not found on this site.' }
  return markPlotWashedById(data.id, workerId)
}

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    year:    'numeric',
  })
}

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function fetchJetwashPayLog(input: {
  periodStart: Date
  lockTime: Date
  workerId?: string | null
}): Promise<{ entries: JetwashPayLogEntry[]; byDay: JetwashPayLogDay[]; total: number }> {
  const supabase = createServiceClient()
  const startIso = input.periodStart.toISOString()
  const endIso = input.lockTime.toISOString()

  let query = supabase
    .from('jetwash_plot_status')
    .select(`
      id, plot_number, item_type, item_label, washed_at, washed_by, site_id,
      sites!jetwash_plot_status_site_id_fkey ( name, address ),
      washer:workers!jetwash_plot_status_washed_by_fkey ( first_name, surname )
    `)
    .not('washed_at', 'is', null)
    .gte('washed_at', startIso)
    .lte('washed_at', endIso)
    .order('washed_at', { ascending: true })

  if (input.workerId) {
    query = query.eq('washed_by', input.workerId)
  }

  const { data, error } = await query
  if (error) throw error

  const siteIds = [...new Set((data ?? []).map((r) => r.site_id))]
  const detailsBySitePlot = new Map<string, Map<string, PlotDetail[]>>()
  for (const siteId of siteIds) {
    detailsBySitePlot.set(siteId, await fetchPlotDetailsBySite(siteId))
  }

  const entries: JetwashPayLogEntry[] = (data ?? []).map((row) => {
    const site = relationOne(row.sites) as { name: string; address: string | null } | null
    const siteDetails = detailsBySitePlot.get(row.site_id)
    const item: WashItemKey = {
      plot_number: row.plot_number,
      item_type:   row.item_type === 'garage' ? 'garage' : 'house',
      item_label:  row.item_label ?? '',
    }
    return {
      id:           row.id,
      washed_at:    row.washed_at!,
      plot_number:  row.plot_number,
      item_type:    item.item_type,
      item_label:   item.item_label,
      title:        jetwashDisplayTitle(item),
      site_id:      row.site_id,
      site_name:    site?.name ?? 'Unknown site',
      site_address: site?.address ?? null,
      washed_by:    row.washed_by,
      washer:       relationOne(row.washer) as { first_name: string; surname: string } | null,
      details:      item.item_type === 'house' ? (siteDetails?.get(row.plot_number) ?? []) : [],
    }
  })

  const dayMap = new Map<string, JetwashPayLogEntry[]>()
  for (const entry of entries) {
    const key = dayKeyFromIso(entry.washed_at)
    const list = dayMap.get(key) ?? []
    list.push(entry)
    dayMap.set(key, list)
  }

  const byDay: JetwashPayLogDay[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEntries]) => ({
      date,
      label:   formatDayLabel(dayEntries[0]!.washed_at),
      entries: dayEntries,
    }))

  return { entries, byDay, total: entries.length }
}

export async function fetchJetwashers() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('workers')
    .select('id, first_name, surname')
    .eq('role', 'jetwasher')
    .eq('status', 'active')
    .order('surname')

  return data ?? []
}

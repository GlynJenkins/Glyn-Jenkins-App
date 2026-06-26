import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  fetchPlotDetailsBySite,
  type PlotDetail,
} from '@/lib/jetwash/plot-descriptions'

export type JetwashPlotRow = {
  id: string
  site_id: string
  plot_number: string
  washed_at: string | null
  washed_by: string | null
  washer: { first_name: string; surname: string } | null
  details: PlotDetail[]
}

export type JetwashPayLogEntry = {
  id: string
  washed_at: string
  plot_number: string
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

/** Mirror price_grid plot numbers into jetwash_plot_status (keeps existing wash records). */
export async function syncJetwashPlots(
  siteId: string,
  plotNumbers?: string[]
): Promise<string[]> {
  const supabase = createServiceClient()
  const plots = plotNumbers ?? (await fetchDistinctPlotNumbers(siteId))

  const { data: existing, error: fetchErr } = await supabase
    .from('jetwash_plot_status')
    .select('id, plot_number')
    .eq('site_id', siteId)

  if (fetchErr) throw fetchErr

  const existingSet = new Set((existing ?? []).map((r) => r.plot_number))
  const plotSet = new Set(plots)

  const toInsert = plots
    .filter((p) => !existingSet.has(p))
    .map((plot_number) => ({ site_id: siteId, plot_number }))

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('jetwash_plot_status').insert(toInsert)
    if (insertErr) throw insertErr
  }

  const orphanIds = (existing ?? [])
    .filter((r) => !plotSet.has(r.plot_number))
    .map((r) => r.id)

  if (orphanIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('jetwash_plot_status')
      .delete()
      .in('id', orphanIds)
    if (deleteErr) throw deleteErr
  }

  return plots
}

export async function fetchJetwashPlots(siteId: string): Promise<JetwashPlotRow[]> {
  await syncJetwashPlots(siteId)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jetwash_plot_status')
    .select(`
      id, site_id, plot_number, washed_at, washed_by,
      washer:workers!jetwash_plot_status_washed_by_fkey ( first_name, surname )
    `)
    .eq('site_id', siteId)
    .order('plot_number')

  if (error) throw error

  const detailsByPlot = await fetchPlotDetailsBySite(siteId)

  const rows = (data ?? []).map((row) => ({
    id:           row.id,
    site_id:      row.site_id,
    plot_number:  row.plot_number,
    washed_at:    row.washed_at,
    washed_by:    row.washed_by,
    washer:       relationOne(row.washer) as { first_name: string; surname: string } | null,
    details:      detailsByPlot.get(row.plot_number) ?? [],
  }))

  return sortPlotNumbers(rows.map((r) => r.plot_number)).map((plot) => {
    const row = rows.find((r) => r.plot_number === plot)!
    return row
  })
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

export async function markPlotWashed(
  siteId: string,
  plotNumber: string,
  workerId: string | null
) {
  const supabase = createServiceClient()

  const { data: existing, error: fetchErr } = await supabase
    .from('jetwash_plot_status')
    .select('id, washed_at')
    .eq('site_id', siteId)
    .eq('plot_number', plotNumber)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!existing) {
    return { ok: false as const, error: 'Plot not found on this site.' }
  }
  if (existing.washed_at) {
    return { ok: false as const, error: 'This plot has already been jetwashed.' }
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('jetwash_plot_status')
    .update({
      washed_at:  now,
      washed_by:  workerId,
      updated_at: now,
    })
    .eq('id', existing.id)
    .is('washed_at', null)

  if (updateErr) throw updateErr

  return { ok: true as const, washed_at: now }
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
      id, plot_number, washed_at, washed_by, site_id,
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
    return {
      id:           row.id,
      washed_at:    row.washed_at!,
      plot_number:  row.plot_number,
      site_id:      row.site_id,
      site_name:    site?.name ?? 'Unknown site',
      site_address: site?.address ?? null,
      washed_by:    row.washed_by,
      washer:       relationOne(row.washer) as { first_name: string; surname: string } | null,
      details:      siteDetails?.get(row.plot_number) ?? [],
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

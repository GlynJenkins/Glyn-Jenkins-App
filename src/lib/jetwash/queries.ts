import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'

export type JetwashPlotRow = {
  id: string
  site_id: string
  plot_number: string
  washed_at: string | null
  washed_by: string | null
  washer: { first_name: string; surname: string } | null
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

  const rows = (data ?? []).map((row) => ({
    id:           row.id,
    site_id:      row.site_id,
    plot_number:  row.plot_number,
    washed_at:    row.washed_at,
    washed_by:    row.washed_by,
    washer:       relationOne(row.washer) as { first_name: string; surname: string } | null,
  }))

  return sortPlotNumbers(rows.map((r) => r.plot_number)).map((plot) => {
    const row = rows.find((r) => r.plot_number === plot)!
    return row
  })
}

export async function fetchJetwashSiteSummaries(): Promise<JetwashSiteSummary[]> {
  const supabase = createServiceClient()

  const { data: sites, error: sitesErr } = await supabase
    .from('sites')
    .select('id, name, address')
    .eq('is_active', true)
    .order('name')

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

export async function markPlotWashed(siteId: string, plotNumber: string, workerId: string) {
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

import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  fetchPlotDetailsBySite,
  formatPlotDetails,
  type PlotDetail,
} from '@/lib/jetwash/plot-descriptions'
import { MIN_FIRESOCK_PHOTOS } from './constants'
import { plotRequiresFiresock } from './plot-exemptions'

export type FiresockPhotoRecord = {
  id:          string
  photo_path:  string
  photo_url:   string | null
  sort_order:  number
  uploaded_at: string
  uploader:    { first_name: string; surname: string } | null
}

export type FiresockPlotRow = {
  id:               string | null
  plot_number:      string
  requires_evidence: boolean
  photo_count:      number
  evidence_met:     boolean
  details:          PlotDetail[]
  photos:           FiresockPhotoRecord[]
}

export type FiresockSiteGrid = {
  site_id:            string
  site_name:          string
  description_labels: string[]
  plots:              FiresockPlotRow[]
}

export type FiresockSiteSummary = {
  site_id:         string
  name:            string
  address:         string | null
  total_plots:     number
  required_plots:  number
  complete_plots:  number
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
    if (!data?.length) break

    for (const row of data) {
      const p = row.plot_number?.trim()
      if (p) plots.add(p)
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  return sortPlotNumbers([...plots])
}

export async function fetchDescriptionLabels(siteId: string): Promise<string[]> {
  const detailsByPlot = await fetchPlotDetailsBySite(siteId)
  const labelOrder: string[] = []
  const seen = new Set<string>()

  for (const details of detailsByPlot.values()) {
    for (const d of details) {
      if (!seen.has(d.label)) {
        seen.add(d.label)
        labelOrder.push(d.label)
      }
    }
  }

  return labelOrder
}

export async function syncFiresockPlots(
  siteId: string,
  plotNumbers?: string[],
): Promise<string[]> {
  const supabase = createServiceClient()
  const plots    = plotNumbers ?? await fetchDistinctPlotNumbers(siteId)
  const details  = await fetchPlotDetailsBySite(siteId)

  const requiredPlots = plots.filter((p) =>
    plotRequiresFiresock(p, details.get(p) ?? []),
  )
  const requiredSet = new Set(requiredPlots)
  const allPlotsSet = new Set(plots)

  const { data: existing, error: fetchErr } = await supabase
    .from('firesock_plot_status')
    .select('id, plot_number')
    .eq('site_id', siteId)

  if (fetchErr) throw fetchErr

  const existingByPlot = new Map((existing ?? []).map((r) => [r.plot_number, r.id]))

  const toInsert = requiredPlots
    .filter((p) => !existingByPlot.has(p))
    .map((plot_number) => ({
      site_id:           siteId,
      plot_number,
      requires_evidence: true,
    }))

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('firesock_plot_status').insert(toInsert)
    if (insertErr) throw insertErr
  }

  const removePlots = (existing ?? [])
    .filter((r) => !allPlotsSet.has(r.plot_number) || !requiredSet.has(r.plot_number))
    .map((r) => r.plot_number)

  if (removePlots.length > 0) {
    await supabase
      .from('firesock_plot_photos')
      .delete()
      .eq('site_id', siteId)
      .in('plot_number', removePlots)

    await supabase
      .from('firesock_plot_status')
      .delete()
      .eq('site_id', siteId)
      .in('plot_number', removePlots)
  }

  return requiredPlots
}

async function fetchPhotoCountsByPlot(siteId: string): Promise<Map<string, number>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('firesock_plot_photos')
    .select('plot_number')
    .eq('site_id', siteId)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const plot = row.plot_number?.trim()
    if (!plot) continue
    counts.set(plot, (counts.get(plot) ?? 0) + 1)
  }
  return counts
}

export async function fetchFiresockMetByPlot(siteId: string): Promise<Map<string, boolean>> {
  await syncFiresockPlots(siteId)

  const supabase = createServiceClient()
  const { data: statuses, error } = await supabase
    .from('firesock_plot_status')
    .select('plot_number, requires_evidence')
    .eq('site_id', siteId)

  if (error) throw error

  const counts = await fetchPhotoCountsByPlot(siteId)
  const result = new Map<string, boolean>()

  for (const row of statuses ?? []) {
    if (!row.requires_evidence) {
      result.set(row.plot_number, true)
      continue
    }
    const count = counts.get(row.plot_number) ?? 0
    result.set(row.plot_number, count >= MIN_FIRESOCK_PHOTOS)
  }

  return result
}

export function firesockEvidenceMet(
  requiresEvidence: boolean,
  photoCount: number,
): boolean {
  if (!requiresEvidence) return true
  return photoCount >= MIN_FIRESOCK_PHOTOS
}

export async function fetchFiresockSiteGrid(siteId: string): Promise<FiresockSiteGrid> {
  await syncFiresockPlots(siteId)

  const supabase = createServiceClient()
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (siteErr) throw siteErr
  if (!site) throw new Error('Site not found.')

  const [detailsByPlot, descriptionLabels, statusesRes, photosRes] = await Promise.all([
    fetchPlotDetailsBySite(siteId),
    fetchDescriptionLabels(siteId),
    supabase
      .from('firesock_plot_status')
      .select('id, plot_number, requires_evidence')
      .eq('site_id', siteId)
      .order('plot_number'),
    supabase
      .from('firesock_plot_photos')
      .select('id, plot_number, photo_path, sort_order, uploaded_at, uploaded_by')
      .eq('site_id', siteId)
      .order('sort_order')
      .order('uploaded_at'),
  ])

  if (statusesRes.error) throw statusesRes.error
  if (photosRes.error) throw photosRes.error

  const uploaderIds = [...new Set(
    (photosRes.data ?? []).map((r) => r.uploaded_by).filter(Boolean) as string[],
  )]
  const uploaderMap = new Map<string, { first_name: string; surname: string }>()

  if (uploaderIds.length > 0) {
    const { data: uploaders } = await supabase
      .from('workers')
      .select('id, first_name, surname')
      .in('id', uploaderIds)

    for (const w of uploaders ?? []) {
      uploaderMap.set(w.id, { first_name: w.first_name, surname: w.surname })
    }
  }

  const photosByPlot = new Map<string, FiresockPhotoRecord[]>()
  const photoPaths = (photosRes.data ?? []).map((r) => r.photo_path).filter(Boolean)

  const signedByPath = new Map<string, string>()
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('worker-documents')
      .createSignedUrls(photoPaths, 3600)
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl)
    }
  }

  for (const row of photosRes.data ?? []) {
    const list = photosByPlot.get(row.plot_number) ?? []
    list.push({
      id:          row.id,
      photo_path:  row.photo_path,
      photo_url:   signedByPath.get(row.photo_path) ?? null,
      sort_order:  row.sort_order,
      uploaded_at: row.uploaded_at,
      uploader:    row.uploaded_by ? uploaderMap.get(row.uploaded_by) ?? null : null,
    })
    photosByPlot.set(row.plot_number, list)
  }

  const plots: FiresockPlotRow[] = (statusesRes.data ?? []).map((row) => {
    const photos = photosByPlot.get(row.plot_number) ?? []
    return {
      id:               row.id,
      plot_number:      row.plot_number,
      requires_evidence: row.requires_evidence,
      photo_count:      photos.length,
      evidence_met:     firesockEvidenceMet(row.requires_evidence, photos.length),
      details:          detailsByPlot.get(row.plot_number) ?? [],
      photos,
    }
  })

  plots.sort((a, b) => {
    const na = parseFloat(a.plot_number)
    const nb = parseFloat(b.plot_number)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.plot_number.localeCompare(b.plot_number, undefined, { numeric: true })
  })

  return {
    site_id:            site.id,
    site_name:          site.name,
    description_labels: descriptionLabels,
    plots,
  }
}

export async function fetchFiresockSiteSummaries(activeOnly = true): Promise<FiresockSiteSummary[]> {
  const supabase = createServiceClient()

  let query = supabase.from('sites').select('id, name, address').order('name')
  if (activeOnly) query = query.eq('is_active', true)

  const { data: sites, error: sitesErr } = await query
  if (sitesErr) throw sitesErr

  const summaries: FiresockSiteSummary[] = []

  for (const site of sites ?? []) {
    try {
      const grid = await fetchFiresockSiteGrid(site.id)
      const required = grid.plots.filter((p) => p.requires_evidence)
      const complete = required.filter((p) => p.evidence_met)

      summaries.push({
        site_id:        site.id,
        name:           site.name,
        address:        site.address,
        total_plots:    grid.plots.length,
        required_plots: required.length,
        complete_plots: complete.length,
      })
    } catch {
      summaries.push({
        site_id:        site.id,
        name:           site.name,
        address:        site.address,
        total_plots:    0,
        required_plots: 0,
        complete_plots: 0,
      })
    }
  }

  return summaries
}

export { formatPlotDetails }

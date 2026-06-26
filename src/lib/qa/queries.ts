import { createServiceClient } from '@/lib/supabase/server'
import {
  descriptionStages,
  fetchPlotDetailsBySite,
  type PlotDetail,
} from '@/lib/jetwash/plot-descriptions'
import { QA_STAGES, type QaStageKey } from './stages'

export type QaInspectionRecord = {
  id:            string
  stage:         QaStageKey
  status:        string
  inspected_at:  string | null
  pdf_path:      string | null
  inspector:     { first_name: string; surname: string } | null
}

export type QaPlotRow = {
  plot_number: string
  details:     PlotDetail[]
  stages:      Record<QaStageKey, QaInspectionRecord | null>
}

export type QaSiteSummary = {
  site_id:          string
  name:             string
  address:          string | null
  total_plots:      number
  total_slots:      number
  completed_slots:  number
}

export type QaSiteGrid = {
  site_id:            string
  site_name:          string
  description_labels: string[]
  plots:              QaPlotRow[]
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
  const supabase = createServiceClient()
  const { data: stages, error } = await supabase
    .from('site_stages')
    .select('id, stage_name, stage_order')
    .eq('site_id', siteId)
    .order('stage_order')

  if (error) throw error
  return descriptionStages(stages ?? []).map((s) => s.stage_name)
}

export async function fetchQaSiteGrid(siteId: string): Promise<QaSiteGrid> {
  const supabase = createServiceClient()

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (siteErr) throw siteErr
  if (!site) throw new Error('Site not found.')

  const [plotNumbers, detailsByPlot, descriptionLabels, inspectionsRes] = await Promise.all([
    fetchDistinctPlotNumbers(siteId),
    fetchPlotDetailsBySite(siteId),
    fetchDescriptionLabels(siteId),
    supabase
      .from('qa_plot_inspections')
      .select('id, plot_number, stage, status, inspected_at, pdf_path, inspected_by')
      .eq('site_id', siteId)
      .eq('status', 'completed'),
  ])

  if (inspectionsRes.error) throw inspectionsRes.error

  const inspectorIds = [...new Set(
    (inspectionsRes.data ?? []).map((r) => r.inspected_by).filter(Boolean) as string[],
  )]
  const inspectorMap = new Map<string, { first_name: string; surname: string }>()

  if (inspectorIds.length > 0) {
    const { data: inspectors } = await supabase
      .from('workers')
      .select('id, first_name, surname')
      .in('id', inspectorIds)
    for (const w of inspectors ?? []) {
      inspectorMap.set(w.id, { first_name: w.first_name, surname: w.surname })
    }
  }

  const byPlotStage = new Map<string, QaInspectionRecord>()
  for (const row of inspectionsRes.data ?? []) {
    const key = `${row.plot_number}|${row.stage}`
    byPlotStage.set(key, {
      id:           row.id,
      stage:        row.stage as QaStageKey,
      status:       row.status,
      inspected_at: row.inspected_at,
      pdf_path:     row.pdf_path,
      inspector:    row.inspected_by ? inspectorMap.get(row.inspected_by) ?? null : null,
    })
  }

  const plots: QaPlotRow[] = plotNumbers.map((plot_number) => {
    const stages = Object.fromEntries(
      QA_STAGES.map((s) => [
        s.key,
        byPlotStage.get(`${plot_number}|${s.key}`) ?? null,
      ]),
    ) as Record<QaStageKey, QaInspectionRecord | null>

    return {
      plot_number,
      details: detailsByPlot.get(plot_number) ?? [],
      stages,
    }
  })

  return {
    site_id:            siteId,
    site_name:          site.name,
    description_labels: descriptionLabels,
    plots,
  }
}

export async function fetchQaSiteSummaries(activeOnly = true): Promise<QaSiteSummary[]> {
  const supabase = createServiceClient()

  let query = supabase.from('sites').select('id, name, address').order('name')
  if (activeOnly) query = query.eq('is_active', true)

  const { data: sites, error: sitesErr } = await query
  if (sitesErr) throw sitesErr

  const summaries: QaSiteSummary[] = []

  for (const site of sites ?? []) {
    const plotNumbers = await fetchDistinctPlotNumbers(site.id)
    const totalPlots = plotNumbers.length
    const totalSlots = totalPlots * QA_STAGES.length

    const { count, error: countErr } = await supabase
      .from('qa_plot_inspections')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .eq('status', 'completed')

    if (countErr) throw countErr

    summaries.push({
      site_id:         site.id,
      name:            site.name,
      address:         site.address,
      total_plots:     totalPlots,
      total_slots:     totalSlots,
      completed_slots: count ?? 0,
    })
  }

  return summaries
}

export async function getQaInspectionForDownload(inspectionId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('qa_plot_inspections')
    .select('id, pdf_path, plot_number, stage, site_id, sites ( name )')
    .eq('id', inspectionId)
    .eq('status', 'completed')
    .maybeSingle()

  if (error) throw error
  return data
}

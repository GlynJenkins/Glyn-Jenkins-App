export type PlotSectionKind = 'house' | 'garage' | 'screen_wall'

const SECTION_ORDER: Record<PlotSectionKind, number> = {
  house:       0,
  garage:      1,
  screen_wall: 2,
}

export function plotSectionKind(plot: string): PlotSectionKind {
  if (/·\s*screen\s*wall/i.test(plot)) return 'screen_wall'
  if (/·\s*garage/i.test(plot)) return 'garage'
  return 'house'
}

function basePlotSortKey(plot: string): number {
  const base = plot.split('·')[0].trim()
  const n = parseFloat(base)
  return isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/** Houses first, then garages, then screen walls — matching the spreadsheet layout. */
export function sortPlotNumbers(plots: string[]): string[] {
  return [...new Set(plots)].sort((a, b) => {
    const sa = SECTION_ORDER[plotSectionKind(a)]
    const sb = SECTION_ORDER[plotSectionKind(b)]
    if (sa !== sb) return sa - sb
    const na = basePlotSortKey(a), nb = basePlotSortKey(b)
    if (na !== nb) return na - nb
    return a.localeCompare(b)
  })
}

export type PlotGridRow =
  | { type: 'section'; key: string; label: string }
  | { type: 'plot'; key: string; plotNumber: string }

const SECTION_LABELS: Record<Exclude<PlotSectionKind, 'house'>, string> = {
  garage:      'Garages',
  screen_wall: 'Screen Walls',
}

/** Ordered plot rows with optional section divider labels before garages / screen walls. */
export function buildPlotGridRows(plots: string[]): PlotGridRow[] {
  const sorted = sortPlotNumbers(plots)
  const rows: PlotGridRow[] = []
  let lastSection: PlotSectionKind | null = null

  for (const plot of sorted) {
    const section = plotSectionKind(plot)
    if (section !== lastSection && section !== 'house') {
      rows.push({ type: 'section', key: `section-${section}`, label: SECTION_LABELS[section] })
    }
    rows.push({ type: 'plot', key: plot, plotNumber: plot })
    lastSection = section
  }

  return rows
}

import type { PlotDetail } from '@/lib/jetwash/plot-descriptions'

function combinedPlotText(plotNumber: string, details: PlotDetail[]): string {
  return [plotNumber, ...details.map((d) => d.value)].join(' ').toLowerCase()
}

export function isScreenWallPlot(plotNumber: string, details: PlotDetail[]): boolean {
  return /screen\s*wall/.test(combinedPlotText(plotNumber, details))
}

export function isGaragePlot(plotNumber: string, details: PlotDetail[]): boolean {
  const pn = plotNumber.toLowerCase().trim()
  if (pn.includes('garage')) return true

  for (const d of details) {
    const label = d.label.toLowerCase()
    const val   = d.value.toLowerCase().trim()
    if (!val) continue

    const typeCol = label.includes('type') || label.includes('plot') || label.includes('house')
    if (typeCol && val.includes('garage') && !val.includes('house')) return true
    if (val === 'garage' || /^garage\b/.test(val) || /\bgarage$/.test(val)) return true
  }

  return false
}

/** House plots need firesock evidence; garages and screen walls are exempt. */
export function plotRequiresFiresock(plotNumber: string, details: PlotDetail[]): boolean {
  return !isScreenWallPlot(plotNumber, details) && !isGaragePlot(plotNumber, details)
}

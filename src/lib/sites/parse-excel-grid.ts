import * as XLSX from 'xlsx'

export function parseExcelCellValue(val: string | number | boolean | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return null
  if (typeof val === 'number') return isFinite(val) ? val : null
  const s = val.toString().trim()
  if (!s || s.startsWith('#')) return null
  const cleaned = s.replace(/[£$€,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

export type ExcelColumnStage = {
  colIndex:   number
  stageName:  string
  headerName: string
}

/** One stage per spreadsheet column; duplicate headers get a suffix so values are not dropped. */
export function buildColumnStages(
  allHeaders: string[],
  plotColIndex: number,
): ExcelColumnStage[] {
  const headerUseCount = new Map<string, number>()
  const columns: ExcelColumnStage[] = []

  for (let i = 0; i < allHeaders.length; i++) {
    if (i === plotColIndex) continue
    const headerName = allHeaders[i]?.trim()
    if (!headerName) continue

    const seen = headerUseCount.get(headerName) ?? 0
    headerUseCount.set(headerName, seen + 1)
    const stageName = seen === 0 ? headerName : `${headerName} (${seen + 1})`
    columns.push({ colIndex: i, stageName, headerName })
  }

  return columns
}

function rowHasStageData(
  row: (string | number | null)[],
  plotColIndex: number,
  allHeaders: string[],
): boolean {
  return allHeaders.some((_, i) => {
    if (i === plotColIndex || !allHeaders[i]) return false
    const v = row[i]
    return v !== null && v !== undefined && String(v).trim() !== ''
  })
}

function rowIsFullyBlank(
  row: (string | number | null)[],
  plotColIndex: number,
  allHeaders: string[],
): boolean {
  const plot = row[plotColIndex]
  if (plot !== null && plot !== undefined && String(plot).trim() !== '') return false
  return !rowHasStageData(row, plotColIndex, allHeaders)
}

function isSectionHeaderLabel(plotVal: string): boolean {
  return /^(garages?|screen\s*walls?|notes?|summary|totals?)$/i.test(plotVal.trim())
}

function labelColumnScore(header: string): number {
  const h = header.toLowerCase()
  if (/house\s*type|property|description|garage|screen|unit|name|type/.test(h)) return 3
  if (/facing|attachment|material/.test(h)) return 2
  return 1
}

/** Text label for ancillary rows (garages, screen walls) when the plot column is empty. */
function derivePlotLabel(
  row: (string | number | null)[],
  plotColIndex: number,
  allHeaders: string[],
): string | null {
  const candidates: { text: string; score: number; colIndex: number }[] = []

  for (let i = 0; i < allHeaders.length; i++) {
    if (i === plotColIndex) continue
    const raw = row[i]
    if (raw === null || raw === undefined) continue
    const text = String(raw).trim()
    if (!text) continue
    if (parseExcelCellValue(raw) !== null) continue
    if (text.length > 80) continue
    candidates.push({
      text,
      score: labelColumnScore(allHeaders[i] ?? ''),
      colIndex: i,
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score || a.colIndex - b.colIndex)
  return candidates[0].text
}

export function resolvePlotRows(
  rows: (string | number | null)[][],
  headerRowIndex: number,
  plotColIndex: number,
  allHeaders: string[],
): (string | number | null)[][] {
  let lastPlot: string | number | null = null

  return rows.slice(headerRowIndex + 1).map((row) => {
    if (rowIsFullyBlank(row, plotColIndex, allHeaders)) {
      lastPlot = null
      return row
    }

    const plotVal = row[plotColIndex]
    const plotStr = plotVal !== null && plotVal !== undefined ? String(plotVal).trim() : ''

    if (plotStr) {
      if (isSectionHeaderLabel(plotStr) && !rowHasStageData(row, plotColIndex, allHeaders)) {
        lastPlot = null
        return row
      }
      if (/garage|screen\s*wall/i.test(plotStr)) {
        lastPlot = plotVal
        return row
      }
      lastPlot = plotVal
      return row
    }

    if (rowHasStageData(row, plotColIndex, allHeaders)) {
      const derived = derivePlotLabel(row, plotColIndex, allHeaders)
      if (derived) {
        lastPlot = derived
        const filled = [...row]
        filled[plotColIndex] = derived
        return filled
      }

      if (lastPlot !== null) {
        const filled = [...row]
        filled[plotColIndex] = lastPlot
        return filled
      }
    }

    return row
  })
}

export function rebuildSheetRef(sheet: XLSX.WorkSheet): void {
  let maxRow = 0
  let maxCol = 0
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue
    try {
      const { r, c } = XLSX.utils.decode_cell(key)
      if (r > maxRow) maxRow = r
      if (c > maxCol) maxCol = c
    } catch { /* ignore */ }
  }
  if (maxRow > 0 || maxCol > 0) {
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
  }
}

export function resolvePlotColumnMerges(sheet: XLSX.WorkSheet, plotColIndex: number): void {
  const merges = (sheet['!merges'] ?? []) as XLSX.Range[]
  for (const merge of merges) {
    if (merge.s.c > plotColIndex || merge.e.c < plotColIndex) continue
    const firstAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: plotColIndex })
    const firstCell = sheet[firstAddr]
    if (!firstCell) continue
    for (let r = merge.s.r + 1; r <= merge.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: plotColIndex })
      if (!sheet[addr]) sheet[addr] = { ...firstCell }
    }
  }
}

export type GridCellInsert = {
  site_id:        string
  stage_id:       string
  plot_number:    string
  contract_value: number | null
  override_note:  string | null
  cell_color:     string
}

function cellHasContent(cell: GridCellInsert): boolean {
  return (cell.contract_value != null && cell.contract_value !== 0) || !!cell.override_note?.trim()
}

function upsertCell(map: Map<string, GridCellInsert>, key: string, incoming: GridCellInsert): boolean {
  const existing = map.get(key)
  if (!existing) {
    map.set(key, incoming)
    return false
  }
  if (!cellHasContent(incoming)) return true
  if (!cellHasContent(existing)) {
    map.set(key, incoming)
    return true
  }
  map.set(key, incoming)
  return true
}

export function buildGridCellsFromRows(opts: {
  siteId:         string
  dataRows:       (string | number | null)[][]
  plotColIndex:   number
  allHeaders:     string[]
  columnStageIds: (string | null)[]
}): {
  cells: GridCellInsert[]
  importedPlots: Set<string>
  skippedRows: number
  duplicateCellsMerged: number
  skippedExamples: string[]
} {
  const { siteId, dataRows, plotColIndex, allHeaders, columnStageIds } = opts
  const cellByKey = new Map<string, GridCellInsert>()
  const importedPlots = new Set<string>()
  let skippedRows = 0
  let duplicateCellsMerged = 0
  const skippedExamples: string[] = []

  for (const row of dataRows) {
    const rawPlot = row[plotColIndex]
    const plotNo  = rawPlot?.toString().trim()
    if (!plotNo) {
      skippedRows++
      if (skippedExamples.length < 5) {
        skippedExamples.push(
          row.map((v) => (v === null ? '(empty)' : String(v).trim().slice(0, 20))).join(' | '),
        )
      }
      continue
    }

    if (isSectionHeaderLabel(plotNo) && !rowHasStageData(row, plotColIndex, allHeaders)) continue

    importedPlots.add(plotNo)

    for (let i = 0; i < allHeaders.length; i++) {
      if (i === plotColIndex) continue
      if (!allHeaders[i]) continue
      const stageId = columnStageIds[i]
      if (!stageId) continue

      const raw      = row[i]
      const numValue = parseExcelCellValue(raw)
      const isNote   = raw !== null && numValue === null && typeof raw === 'string' && raw.trim() !== ''

      const incoming: GridCellInsert = {
        site_id:        siteId,
        stage_id:       stageId,
        plot_number:    plotNo,
        contract_value: numValue,
        override_note:  isNote ? raw.trim() : null,
        cell_color:     'white',
      }

      const key = `${stageId}|${plotNo}`
      if (upsertCell(cellByKey, key, incoming)) duplicateCellsMerged++
    }
  }

  return {
    cells:               Array.from(cellByKey.values()),
    importedPlots,
    skippedRows,
    duplicateCellsMerged,
    skippedExamples,
  }
}

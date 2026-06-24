import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

// Parse a cell value into a number, handling currency strings, formula results, and Excel errors
function parseValue(val: string | number | boolean | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return null
  if (typeof val === 'number') return isFinite(val) ? val : null
  const s = val.toString().trim()
  if (!s || s.startsWith('#')) return null   // Excel error: #N/A, #VALUE!, #REF! etc.
  const cleaned = s.replace(/[£$€,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// Find the most likely header row — first row with multiple non-empty cells
function findHeaderRow(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const nonEmpty = rows[i].filter((c) => c != null && c.toString().trim() !== '')
    if (nonEmpty.length >= 2) return i  // at least 2 columns = likely a header
  }
  return 0  // fall back to row 0
}

// Guess which column index is the plot/unit number
function guessPlotsColumn(headerRow: (string | number | null)[]): number {
  const plotKeywords = ['plot', 'unit', 'house', 'no.', 'number', 'ref', 'id', 'property', 'address']
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i]?.toString().toLowerCase() ?? ''
    if (plotKeywords.some((k) => h.includes(k))) return i
  }
  return 0  // default to first column
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    await params
    const formData = await request.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })

    const buffer   = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const sheets = workbook.SheetNames.map((name) => {
      const sheet   = workbook.Sheets[name]

      // Step 1: rebuild !ref from actual cell addresses so all rows are read
      {
        let maxRow = 0, maxCol = 0
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

      // Step 2: first read — find header row and plot column
      const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null, raw: true }) as (string | number | null)[][]
      if (rawRows.length < 2) return { name, usable: false, headers: [], plotCount: 0, plotColIndex: 0, headerRowIdx: 0 }

      const headerIdx    = findHeaderRow(rawRows)
      const headerRow    = rawRows[headerIdx]
      const allHeaders   = headerRow.map((h) => h?.toString().trim() ?? '')
      const plotColIndex = guessPlotsColumn(headerRow)

      // Step 3: resolve merged cells in the PLOT column only
      // This fills sub-rows of vertically-merged plot cells without corrupting
      // header/title rows that may be merged across all columns.
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

      // Step 4: re-read rows now that merged plot cells are filled
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null, raw: true }) as (string | number | null)[][]

      // All other columns become stages
      const stageNames = allHeaders.filter((_, i) => i !== plotColIndex && allHeaders[i] !== '')

      // Merged plot cells are already resolved. Also apply fill-down for any remaining
      // empty plot cells that have stage data, without resetting across blank rows.
      let lastPlot: string | number | null = null
      const dataRows = rows.slice(headerIdx + 1).map((row) => {
        const plotVal = row[plotColIndex]
        const hasStageData = allHeaders.some((_, i) => {
          if (i === plotColIndex) return false
          const v = row[i]
          return v !== null && v !== undefined && String(v).trim() !== ''
        })
        if (plotVal !== null && plotVal !== undefined && String(plotVal).trim() !== '') {
          lastPlot = plotVal
          return row
        }
        if (hasStageData && lastPlot !== null) {
          const filled = [...row]
          filled[plotColIndex] = lastPlot
          return filled
        }
        return row
      }).filter((r) => {
        const v = r[plotColIndex]
        return v !== null && v !== undefined && String(v).trim() !== ''
      })

      // Column totals across ALL data rows (numeric only)
      const colTotals: number[] = []
      for (let i = 0; i < allHeaders.length; i++) {
        if (i === plotColIndex || !allHeaders[i]) continue
        const sum = dataRows.reduce((acc, row) => acc + (parseValue(row[i]) ?? 0), 0)
        colTotals.push(Math.round(sum * 100) / 100)
      }

      // Sample keeps raw display value — numbers shown as £, text preserved as-is
      const sample = dataRows.slice(0, 5).map((row) => {
        const values: string[] = []
        for (let i = 0; i < allHeaders.length; i++) {
          if (i === plotColIndex || !allHeaders[i]) continue
          const raw = row[i]
          if (raw === null || raw === undefined || raw.toString().trim() === '') {
            values.push('')
            continue
          }
          const num = parseValue(raw)
          values.push(num !== null
            ? `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
            : raw.toString().trim()
          )
        }
        return { plot: row[plotColIndex]?.toString().trim() ?? '', values }
      })

      return {
        name,
        usable:      true,
        headers:     allHeaders,
        stages:      stageNames,
        plotCount:   dataRows.length,
        plotColIndex,
        headerRowIdx: headerIdx,
        headerRow:   headerIdx + 1,
        sample,
        colTotals,   // one total per stage column, in stage order
      }
    })

    return NextResponse.json({ success: true, sheets })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read file.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import {
  buildColumnStages,
  classifyImportedPlots,
  parseExcelCellValue,
  rebuildSheetRef,
  resolvePlotColumnMerges,
  resolvePlotRows,
} from '@/lib/sites/parse-excel-grid'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

function findHeaderRow(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const nonEmpty = rows[i].filter((c) => c != null && c.toString().trim() !== '')
    if (nonEmpty.length >= 2) return i
  }
  return 0
}

function guessPlotsColumn(headerRow: (string | number | null)[]): number {
  const plotKeywords = ['plot', 'unit', 'house', 'no.', 'number', 'ref', 'id', 'property', 'address']
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i]?.toString().toLowerCase() ?? ''
    if (plotKeywords.some((k) => h.includes(k))) return i
  }
  return 0
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
      rebuildSheetRef(sheet)

      const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        sheet, { header: 1, defval: null, raw: true }
      ) as (string | number | null)[][]

      if (rawRows.length < 2) {
        return { name, usable: false, headers: [], plotCount: 0, plotColIndex: 0, headerRowIdx: 0 }
      }

      const headerIdx    = findHeaderRow(rawRows)
      const headerRow    = rawRows[headerIdx]
      const allHeaders   = headerRow.map((h) => h?.toString().trim() ?? '')
      const plotColIndex = guessPlotsColumn(headerRow)

      resolvePlotColumnMerges(sheet, plotColIndex)
      rebuildSheetRef(sheet)

      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
        sheet, { header: 1, defval: null, raw: true }
      ) as (string | number | null)[][]

      const columnStages = buildColumnStages(allHeaders, plotColIndex)
      const stageNames   = columnStages.map((c) => c.stageName)
      const dataRows     = resolvePlotRows(rows, headerIdx, plotColIndex, allHeaders).filter((r) => {
        const v = r[plotColIndex]
        return v !== null && v !== undefined && String(v).trim() !== ''
      })

      const colTotals: number[] = columnStages.map((col) => {
        const sum = dataRows.reduce((acc, row) => acc + (parseExcelCellValue(row[col.colIndex]) ?? 0), 0)
        return Math.round(sum * 100) / 100
      })

      const sample = dataRows.slice(0, 5).map((row) => {
        const values: string[] = columnStages.map((col) => {
          const raw = row[col.colIndex]
          if (raw === null || raw === undefined || raw.toString().trim() === '') return ''
          const num = parseExcelCellValue(raw)
          return num !== null
            ? `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
            : raw.toString().trim()
        })
        return { plot: row[plotColIndex]?.toString().trim() ?? '', values }
      })

      const plotNumbers = dataRows.map((row) => row[plotColIndex]?.toString().trim() ?? '').filter(Boolean)
      const sections    = classifyImportedPlots(plotNumbers)

      return {
        name,
        usable:       true,
        headers:      allHeaders,
        stages:       stageNames,
        plotCount:    dataRows.length,
        plotColIndex,
        headerRowIdx: headerIdx,
        headerRow:    headerIdx + 1,
        sample,
        colTotals,
        sections,
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

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { syncJetwashPlots } from '@/lib/jetwash/queries'
import { syncFiresockPlots } from '@/lib/firesock/queries'
import {
  buildColumnStages,
  buildGridCellsFromRows,
  rebuildSheetRef,
  resolvePlotColumnMerges,
  resolvePlotRows,
} from '@/lib/sites/parse-excel-grid'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const formData   = await request.formData()
    const file            = formData.get('file')          as File | null
    const sheetName       = formData.get('sheetName')     as string | null
    const plotColRaw      = formData.get('plotColIndex')  as string | null
    const headerRowIdxRaw = formData.get('headerRowIdx')  as string | null
    const plotColIndex    = plotColRaw      != null ? parseInt(plotColRaw)      : 0
    const confirmedHeaderRowIdx = headerRowIdxRaw != null ? parseInt(headerRowIdxRaw) : null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    const buffer   = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const targetSheet = sheetName && workbook.SheetNames.includes(sheetName)
      ? sheetName
      : workbook.SheetNames[0]

    const sheet = workbook.Sheets[targetSheet]
    resolvePlotColumnMerges(sheet, plotColIndex)
    rebuildSheetRef(sheet)

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
      sheet, { header: 1, defval: null, raw: true }
    )

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'The file must have at least a header row and one data row.' },
        { status: 400 }
      )
    }

    let headerRowIndex: number
    if (confirmedHeaderRowIdx != null && !isNaN(confirmedHeaderRowIdx)) {
      headerRowIndex = confirmedHeaderRowIdx
    } else {
      headerRowIndex = 0
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const nonEmpty = (rows[i] as (string | number | null)[]).filter((c) => c != null && c.toString().trim() !== '')
        if (nonEmpty.length >= 2) { headerRowIndex = i; break }
      }
    }

    const headerRow  = rows[headerRowIndex] as (string | number | null)[]
    const allHeaders = headerRow.map((h) => h?.toString().trim() ?? '')
    const columnStages = buildColumnStages(allHeaders, plotColIndex)
    const stageNames   = columnStages.map((c) => c.stageName)

    if (stageNames.length === 0) {
      return NextResponse.json({ error: 'No stage columns found in the spreadsheet.' }, { status: 400 })
    }

    const dataRows = resolvePlotRows(rows, headerRowIndex, plotColIndex, allHeaders)

    const supabase = createServiceClient()

    await supabase.from('price_grid').delete().eq('site_id', siteId)
    await supabase.from('site_stages').delete().eq('site_id', siteId)

    const { data: stages, error: stagesError } = await supabase
      .from('site_stages')
      .insert(
        columnStages.map((col, i) => ({
          site_id:     siteId,
          stage_name:  col.stageName,
          stage_order: i + 1,
        }))
      )
      .select('id, stage_name')

    if (stagesError || !stages) {
      return NextResponse.json(
        { error: stagesError?.message ?? 'Failed to create stages.' },
        { status: 500 }
      )
    }

    const stageMap = new Map(stages.map((s) => [s.stage_name, s.id]))
    const columnStageIds: (string | null)[] = allHeaders.map((name, i) => {
      if (i === plotColIndex || !name) return null
      const col = columnStages.find((c) => c.colIndex === i)
      return col ? stageMap.get(col.stageName) ?? null : null
    })

    const {
      cells,
      importedPlots,
      skippedRows,
      duplicateCellsMerged,
      skippedExamples,
    } = buildGridCellsFromRows({
      siteId,
      dataRows,
      plotColIndex,
      allHeaders,
      columnStageIds,
    })

    const stageCellCount = new Map<string, number>()
    stageNames.forEach((n) => stageCellCount.set(n, 0))
    for (const cell of cells) {
      const stageName = stages.find((s) => s.id === cell.stage_id)?.stage_name
      if (stageName) {
        stageCellCount.set(stageName, (stageCellCount.get(stageName) ?? 0) + 1)
      }
    }

    const BATCH = 500
    for (let i = 0; i < cells.length; i += BATCH) {
      const { error } = await supabase.from('price_grid').insert(cells.slice(i, i + BATCH))
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    const stageReport = stageNames.map((name) => ({
      name,
      cells: stageCellCount.get(name) ?? 0,
    }))

    const plotList = Array.from(importedPlots).sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b)
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb
    })

    try {
      await syncJetwashPlots(siteId, plotList)
    } catch (syncErr) {
      console.error('[Jetwash sync]', syncErr)
    }

    try {
      await syncFiresockPlots(siteId, plotList)
    } catch (syncErr) {
      console.error('[Firesock sync]', syncErr)
    }

    const boundaryDump = dataRows.map((r, i) => {
      const plotVal = r[plotColIndex]
      const hasData = r.some((v, ci) => ci !== plotColIndex && v !== null && v !== undefined && String(v).trim() !== '')
      return { rowOffset: i + 1, plot: plotVal, hasData }
    }).filter((r) => r.plot !== null || r.hasData).slice(0, 200)

    return NextResponse.json({
      success:        true,
      sheetUsed:      targetSheet,
      headerRow:      headerRowIndex + 1,
      plotColUsed:    allHeaders[plotColIndex],
      stages:         stages.length,
      cells:          cells.length,
      plotCount:      importedPlots.size,
      plotMin:        plotList[0]  ?? null,
      plotMax:        plotList[plotList.length - 1] ?? null,
      plotList,
      totalRowsRead:  rows.length,
      boundaryDump,
      skippedRows,
      skippedExamples,
      duplicateCellsMerged,
      stageReport,
    })
  } catch (err) {
    console.error('[Excel Import Error]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error during import.' },
      { status: 500 }
    )
  }
}

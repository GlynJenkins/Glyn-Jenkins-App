import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { syncJetwashPlots } from '@/lib/jetwash/queries'
import { syncFiresockPlots } from '@/lib/firesock/queries'
import {
  buildColumnStages,
  buildGridCellsFromRows,
  classifyImportedPlots,
  rebuildSheetRef,
  resolvePlotColumnMerges,
  resolvePlotRows,
  validateImportFile,
} from '@/lib/sites/parse-excel-grid'
import { sortPlotNumbers } from '@/lib/sites/plot-order'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const BATCH = 500

/** Restore a previously backed-up grid after a failed import. */
async function restoreGridBackup(
  supabase: SupabaseClient,
  siteId: string,
  oldStages: Record<string, unknown>[],
  oldCells: Record<string, unknown>[],
): Promise<boolean> {
  try {
    // Remove any partially-inserted new rows first.
    await supabase.from('price_grid').delete().eq('site_id', siteId)
    await supabase.from('site_stages').delete().eq('site_id', siteId)

    if (oldStages.length > 0) {
      const { error } = await supabase.from('site_stages').insert(oldStages)
      if (error) throw error
    }
    for (let i = 0; i < oldCells.length; i += BATCH) {
      const { error } = await supabase.from('price_grid').insert(oldCells.slice(i, i + BATCH))
      if (error) throw error
    }
    return true
  } catch (err) {
    console.error('[Excel Import] Failed to restore grid backup:', err)
    return false
  }
}

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

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    const fileError = validateImportFile(file)
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 })
    }

    const plotColIndex = plotColRaw != null ? Number(plotColRaw) : 0
    if (!Number.isInteger(plotColIndex) || plotColIndex < 0 || plotColIndex > 200) {
      return NextResponse.json({ error: 'Invalid plot column index.' }, { status: 400 })
    }

    let confirmedHeaderRowIdx: number | null = null
    if (headerRowIdxRaw != null && headerRowIdxRaw !== '') {
      const n = Number(headerRowIdxRaw)
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid header row index.' }, { status: 400 })
      }
      confirmedHeaderRowIdx = n
    }

    const supabase = createServiceClient()

    // Verify the site exists before touching anything.
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .maybeSingle()
    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    // ------- Parse and validate the ENTIRE new grid in memory first -------

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
    if (confirmedHeaderRowIdx != null) {
      if (confirmedHeaderRowIdx >= rows.length) {
        return NextResponse.json({ error: 'Header row index is beyond the end of the sheet.' }, { status: 400 })
      }
      headerRowIndex = confirmedHeaderRowIdx
    } else {
      headerRowIndex = 0
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const nonEmpty = (rows[i] as (string | number | null)[]).filter((c) => c != null && c.toString().trim() !== '')
        if (nonEmpty.length >= 2) { headerRowIndex = i; break }
      }
    }

    const headerRow  = rows[headerRowIndex] as (string | number | null)[]
    if (plotColIndex >= headerRow.length) {
      return NextResponse.json({ error: 'Plot column index is beyond the sheet width.' }, { status: 400 })
    }
    const allHeaders = headerRow.map((h) => h?.toString().trim() ?? '')
    const columnStages = buildColumnStages(allHeaders, plotColIndex)
    const stageNames   = columnStages.map((c) => c.stageName)

    if (stageNames.length === 0) {
      return NextResponse.json({ error: 'No stage columns found in the spreadsheet.' }, { status: 400 })
    }

    const dataRows = resolvePlotRows(rows, headerRowIndex, plotColIndex, allHeaders)

    // Dry-run cell build using stage names as placeholder IDs — this validates
    // the whole grid (and catches empty imports) BEFORE anything is deleted.
    const placeholderStageIds: (string | null)[] = allHeaders.map((name, i) => {
      if (i === plotColIndex || !name) return null
      const col = columnStages.find((c) => c.colIndex === i)
      return col ? col.stageName : null
    })
    const dryRun = buildGridCellsFromRows({
      siteId,
      dataRows,
      plotColIndex,
      allHeaders,
      columnStageIds: placeholderStageIds,
    })
    if (dryRun.cells.length === 0 || dryRun.importedPlots.size === 0) {
      return NextResponse.json(
        { error: 'No plots or cell values could be read from the spreadsheet. The existing grid has not been changed.' },
        { status: 400 }
      )
    }

    // ------- Back up the existing grid so a failed import can be restored -------

    const { data: oldStages, error: oldStagesError } = await supabase
      .from('site_stages').select('*').eq('site_id', siteId)
    const { data: oldCells, error: oldCellsError } = await supabase
      .from('price_grid').select('*').eq('site_id', siteId)

    if (oldStagesError || oldCellsError) {
      return NextResponse.json(
        { error: 'Could not read the existing grid — import aborted, nothing was changed.' },
        { status: 500 }
      )
    }

    const backupStages = oldStages ?? []
    const backupCells  = oldCells ?? []

    // ------- Replace the grid (restore the backup if anything fails) -------

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
      const restored = await restoreGridBackup(supabase, siteId, backupStages, backupCells)
      console.error('[Excel Import] Stage insert failed:', stagesError)
      return NextResponse.json(
        {
          error: restored
            ? 'Import failed while creating stages — the previous grid has been restored.'
            : 'Import failed while creating stages AND the previous grid could not be restored. Please re-import.',
        },
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
      conflicts,
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

    for (let i = 0; i < cells.length; i += BATCH) {
      const { error } = await supabase.from('price_grid').insert(cells.slice(i, i + BATCH))
      if (error) {
        const restored = await restoreGridBackup(supabase, siteId, backupStages, backupCells)
        console.error('[Excel Import] Cell insert failed:', error)
        return NextResponse.json(
          {
            error: restored
              ? 'Import failed while inserting cells — the previous grid has been restored.'
              : 'Import failed while inserting cells AND the previous grid could not be restored. Please re-import.',
          },
          { status: 500 }
        )
      }
    }

    const stageReport = stageNames.map((name) => ({
      name,
      cells: stageCellCount.get(name) ?? 0,
    }))

    // Make conflicts readable: map stage IDs back to names.
    const stageNameById = new Map(stages.map((s) => [s.id, s.stage_name]))
    const conflictReport = conflicts.slice(0, 50).map((c) => ({
      plot:      c.plot_number,
      stage:     stageNameById.get(c.stage_id) ?? c.stage_id,
      kept:      c.keptValue,
      discarded: c.discardedValue,
    }))

    const plotList = sortPlotNumbers(Array.from(importedPlots))
    const sections = classifyImportedPlots(plotList)

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
      sections,
      totalRowsRead:  rows.length,
      boundaryDump,
      skippedRows,
      skippedExamples,
      duplicateCellsMerged,
      conflicts:      conflictReport,
      stageReport,
    })
  } catch (err) {
    console.error('[Excel Import Error]', err)
    return NextResponse.json(
      { error: 'Unexpected error during import. The grid may not have been changed — please check and retry.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { syncJetwashPlots } from '@/lib/jetwash/queries'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

// Parse cell value to number — handles currency strings, formula results, and Excel errors
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
    // If the exact header row index was confirmed in the preview, use it directly.
    // Fall back to auto-detection only if not provided (e.g. old clients).
    const confirmedHeaderRowIdx = headerRowIdxRaw != null ? parseInt(headerRowIdxRaw) : null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    // ── Parse Excel file ───────────────────────────────────────
    const buffer   = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // Use selected sheet or fall back to first sheet
    const targetSheet = sheetName && workbook.SheetNames.includes(sheetName)
      ? sheetName
      : workbook.SheetNames[0]

    const sheet = workbook.Sheets[targetSheet]

    // ── Step 1: resolve merged cells in the PLOT column only ──
    // Excel merged cells only store the value in the top-left cell; all other
    // cells in a vertical merge are empty. We fill downward ONLY in the plot
    // column so sub-rows of a merged plot block get the correct plot number.
    // We deliberately do NOT touch other columns — merged title/header rows
    // that span the full width would otherwise overwrite stage column headers.
    const merges = (sheet['!merges'] ?? []) as XLSX.Range[]
    for (const merge of merges) {
      // Only fill merges that are in, or contain, the plot column
      if (merge.s.c > plotColIndex || merge.e.c < plotColIndex) continue
      const firstAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: plotColIndex })
      const firstCell = sheet[firstAddr]
      if (!firstCell) continue
      for (let r = merge.s.r + 1; r <= merge.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: plotColIndex })
        if (!sheet[addr]) sheet[addr] = { ...firstCell }
      }
    }

    // ── Step 2: rebuild !ref from actual cell addresses ───────
    // The saved !ref (used-range) is often stale and doesn't cover rows added
    // after the file was first created. Instead of guessing, scan every real
    // cell in the sheet and set !ref to the true extent.
    {
      let maxRow = 0, maxCol = 0
      for (const key of Object.keys(sheet)) {
        if (key.startsWith('!')) continue
        try {
          const { r, c } = XLSX.utils.decode_cell(key)
          if (r > maxRow) maxRow = r
          if (c > maxCol) maxCol = c
        } catch { /* ignore non-cell keys */ }
      }
      if (maxRow > 0 || maxCol > 0) {
        sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
      }
    }

    // raw:true  → formula results come through as their cached numeric value
    // defval:null → empty cells become null rather than undefined
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
      sheet, { header: 1, defval: null, raw: true }
    )

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'The file must have at least a header row and one data row.' },
        { status: 400 }
      )
    }

    // ── Step 3: locate the header row ─────────────────────────
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
    const stageNames = allHeaders.filter((h, i) => i !== plotColIndex && h !== '')

    // All rows after the header; merged plot cells are already resolved above.
    // Also apply fill-down for any remaining empty plot cells that have stage data
    // (handles cases like block-label rows where the plot number is absent but data exists).
    let lastPlot: string | number | null = null
    const dataRows = (rows.slice(headerRowIndex + 1) as (string | number | null)[][]).map((row) => {
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
      // Blank rows don't reset lastPlot — the next section can still inherit it
      return row
    })

    if (stageNames.length === 0) {
      return NextResponse.json({ error: 'No stage columns found in the spreadsheet.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── Clear existing data for a clean re-import ──────────────
    await supabase.from('price_grid').delete().eq('site_id', siteId)
    await supabase.from('site_stages').delete().eq('site_id', siteId)

    // ── Insert stages ──────────────────────────────────────────
    const { data: stages, error: stagesError } = await supabase
      .from('site_stages')
      .insert(
        stageNames.map((name, i) => ({
          site_id:     siteId,
          stage_name:  name,
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

    // Build name → id lookup
    const stageMap = new Map(stages.map((s) => [s.stage_name, s.id]))

    // ── Build cell records ─────────────────────────────────────
    type CellInsert = {
      site_id:        string
      stage_id:       string
      plot_number:    string
      contract_value: number | null
      override_note:  string | null
      cell_color:     string
    }

    const cells: CellInsert[] = []
    // Track cells per stage for the detailed report
    const stageCellCount = new Map<string, number>()
    stageNames.forEach((n) => stageCellCount.set(n, 0))

    let skippedRows = 0
    const skippedExamples: string[] = []   // first few skipped row descriptions
    const importedPlots  = new Set<string>()

    for (const row of dataRows) {
      const rawPlot = (row as (string | number | null)[])[plotColIndex]
      const plotNo  = rawPlot?.toString().trim()
      if (!plotNo) {
        skippedRows++
        // Record what the row looks like for debugging (first 5)
        if (skippedExamples.length < 5) {
          const rowStr = (row as (string | number | null)[])
            .map((v) => (v === null ? '(empty)' : String(v).trim().slice(0, 20)))
            .join(' | ')
          skippedExamples.push(rowStr)
        }
        continue
      }
      importedPlots.add(plotNo)

      for (let i = 0; i < allHeaders.length; i++) {
        if (i === plotColIndex) continue
        const stageName = allHeaders[i]
        if (!stageName) continue
        const stageId = stageMap.get(stageName)
        // Safety: if stageMap doesn't have this name, skip but record the miss
        if (!stageId) continue

        const raw      = (row as (string | number | null)[])[i]
        const numValue = parseValue(raw)
        const isNote   = raw !== null && numValue === null && typeof raw === 'string' && raw.trim() !== ''

        cells.push({
          site_id:        siteId,
          stage_id:       stageId,
          plot_number:    plotNo,
          contract_value: numValue,
          override_note:  isNote ? raw.trim() : null,
          cell_color:     'white',
        })
        stageCellCount.set(stageName, (stageCellCount.get(stageName) ?? 0) + 1)
      }
    }

    // ── Insert cells in batches ────────────────────────────────
    const BATCH = 500
    for (let i = 0; i < cells.length; i += BATCH) {
      const { error } = await supabase.from('price_grid').insert(cells.slice(i, i + BATCH))
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // ── Build per-stage report ─────────────────────────────────
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

    // Raw rows around the boundary — helps diagnose cutoff issues
    const boundaryDump = rows.slice(headerRowIndex + 1).map((r, i) => {
      const typed = r as (string | number | null)[]
      const plotVal = typed[plotColIndex]
      const hasData = typed.some((v, ci) => ci !== plotColIndex && v !== null && v !== undefined && String(v).trim() !== '')
      return { rowOffset: i + 1, plot: plotVal, hasData }
    }).filter((r) => r.plot !== null || r.hasData)
      .slice(0, 200)   // first 200 data-bearing rows

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

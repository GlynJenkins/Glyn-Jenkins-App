import type { SupabaseClient } from '@supabase/supabase-js'

export type ClaimHistoryEntry = {
  claimId: string
  foremanName: string
  pct: number
  value: number
  periodStart: string
  periodEnd: string
  submittedAt: string | null
  status: string
  voided: boolean
}

export type ClaimHistoryMap = Record<string, ClaimHistoryEntry[]>

export type BuildHistoryExportRow = {
  plotNumber: string
  stageName: string
  stageOrder: number
  cellId: string
  entry: ClaimHistoryEntry
}

type RawPoolItem = {
  type?: unknown
  id?: unknown
  amount?: unknown
  fullValue?: unknown
  siteId?: unknown
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function foremanDisplayName(
  worker: { first_name: string; surname: string } | null | undefined,
): string {
  if (!worker) return 'Unknown foreman'
  const name = `${worker.first_name} ${worker.surname}`.trim()
  return name || 'Unknown foreman'
}

function parseGridClaimFromPoolItem(
  raw: unknown,
): { cellId: string; pct: number; value: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as RawPoolItem
  if (item.type !== 'grid_cell') return null
  const cellId = typeof item.id === 'string' ? item.id.trim() : ''
  if (!cellId) return null

  const amount = typeof item.amount === 'number' ? item.amount : Number(item.amount)
  if (!Number.isFinite(amount) || amount < 0) return null

  const fullRaw = item.fullValue
  const fullValue =
    typeof fullRaw === 'number' ? fullRaw : fullRaw != null ? Number(fullRaw) : NaN

  let pct = 0
  if (Number.isFinite(fullValue) && fullValue > 0) {
    pct = Math.round((amount / fullValue) * 100)
  }

  return { cellId, pct, value: round2(amount) }
}

function isVoidedStatus(status: string): boolean {
  return status === 'rejected' || status === 'withdrawn'
}

/**
 * Invert claim_periods.pool_items into a per-cell claim history map for one site.
 */
export async function loadSiteClaimHistory(
  supabase: SupabaseClient,
  siteId: string,
): Promise<ClaimHistoryMap> {
  const { data: siteCells, error: cellsError } = await supabase
    .from('price_grid')
    .select('id, plot_number, stage_id, site_stages ( stage_name )')
    .eq('site_id', siteId)

  if (cellsError) {
    throw new Error(`Failed to load site cells: ${cellsError.message}`)
  }

  const siteCellIds = new Set((siteCells ?? []).map((c) => c.id as string))

  // Fallback when grid was re-imported and cell UUIDs changed but labels still match.
  const cellIdByPlotStage = new Map<string, string>()
  for (const cell of siteCells ?? []) {
    const stageRel = cell.site_stages as
      | { stage_name: string }
      | { stage_name: string }[]
      | null
    const stage = Array.isArray(stageRel) ? stageRel[0] : stageRel
    const stageName = stage?.stage_name?.trim()
    if (!stageName) continue
    cellIdByPlotStage.set(
      `${String(cell.plot_number).trim().toLowerCase()}|${stageName.toLowerCase()}`,
      cell.id,
    )
  }

  // Single-site claims + multi-site claims (null site_id) that may include this site.
  const { data: claims, error: claimsError } = await supabase
    .from('claim_periods')
    .select(
      'id, foreman_id, period_start, period_end, submitted_at, status, pool_items, site_id',
    )
    .or(`site_id.eq.${siteId},site_id.is.null`)
    .order('period_end', { ascending: true })

  if (claimsError) {
    throw new Error(`Failed to load claims: ${claimsError.message}`)
  }

  const foremanIds = [
    ...new Set(
      (claims ?? [])
        .map((c) => c.foreman_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ]

  const foremanById = new Map<string, { first_name: string; surname: string }>()
  if (foremanIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, first_name, surname')
      .in('id', foremanIds)
    for (const w of workers ?? []) {
      foremanById.set(w.id, { first_name: w.first_name, surname: w.surname })
    }
  }

  const map: ClaimHistoryMap = {}

  for (const claim of claims ?? []) {
    const status = String(claim.status ?? '')
    const voided = isVoidedStatus(status)
    const pool = Array.isArray(claim.pool_items)
      ? claim.pool_items
      : typeof claim.pool_items === 'string'
        ? (() => {
            try { return JSON.parse(claim.pool_items) as unknown[] }
            catch { return [] }
          })()
        : []
    const foremanName = foremanDisplayName(foremanById.get(claim.foreman_id))

    for (const raw of pool) {
      const parsed = parseGridClaimFromPoolItem(raw)
      if (!parsed) continue

      let cellId = parsed.cellId
      if (!siteCellIds.has(cellId)) {
        const label = typeof (raw as { label?: unknown }).label === 'string'
          ? (raw as { label: string }).label
          : ''
        const remapped = remapCellIdFromLabel(label, cellIdByPlotStage)
        if (remapped) cellId = remapped
      }

      // Multi-site claims: only cells on this site. Single-site for this site: keep all.
      if (claim.site_id !== siteId && !siteCellIds.has(cellId)) continue

      const entry: ClaimHistoryEntry = {
        claimId:     claim.id,
        foremanName,
        pct:         parsed.pct,
        value:       parsed.value,
        periodStart: String(claim.period_start ?? '').slice(0, 10),
        periodEnd:   String(claim.period_end ?? '').slice(0, 10),
        submittedAt: claim.submitted_at ? String(claim.submitted_at) : null,
        status,
        voided,
      }

      if (!map[cellId]) map[cellId] = []
      map[cellId].push(entry)
    }
  }

  for (const cellId of Object.keys(map)) {
    map[cellId].sort((a, b) => {
      const byPeriod = a.periodEnd.localeCompare(b.periodEnd)
      if (byPeriod !== 0) return byPeriod
      const aSub = a.submittedAt ?? ''
      const bSub = b.submittedAt ?? ''
      return aSub.localeCompare(bSub)
    })
  }

  return map
}

/** Match "Plot 30 — Joist" style labels back onto current grid cells. */
function remapCellIdFromLabel(
  label: string,
  cellIdByPlotStage: Map<string, string>,
): string | null {
  const match = label.match(/^Plot\s+(.+?)\s+[—–-]\s+(.+)$/i)
  if (!match) return null
  const key = `${match[1].trim().toLowerCase()}|${match[2].trim().toLowerCase()}`
  return cellIdByPlotStage.get(key) ?? null
}

/** Format period end as "w/e 14 Jun 2025". */
export function formatClaimWeekEnding(isoDate: string): string {
  const value = isoDate.slice(0, 10)
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  const label = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `w/e ${label}`
}

export function formatClaimHistoryLine(entry: ClaimHistoryEntry): string {
  const money = '£' + entry.value.toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const statusLabel = entry.status
    ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1)
    : 'Unknown'
  const base = `${entry.foremanName} — ${entry.pct}% (${money}) · ${formatClaimWeekEnding(entry.periodEnd)} · ${statusLabel}`
  if (!entry.voided) return base
  if (entry.status === 'withdrawn') return `${base} (withdrawn)`
  if (entry.status === 'rejected') return `${base} (rejected)`
  return `${base} (voided)`
}

export function summarizePlotBuilders(
  stageEntries: Array<{ stageName: string; entries: ClaimHistoryEntry[] }>,
): string {
  const byForeman = new Map<string, Set<string>>()

  for (const { stageName, entries } of stageEntries) {
    for (const entry of entries) {
      if (entry.voided) continue
      if (!byForeman.has(entry.foremanName)) {
        byForeman.set(entry.foremanName, new Set())
      }
      byForeman.get(entry.foremanName)!.add(stageName)
    }
  }

  const parts = [...byForeman.entries()].map(([name, stages]) => {
    const stageList = [...stages].join(', ')
    return `${name} (${stageList})`
  })

  if (parts.length === 0) return 'Not yet claimed'
  return parts.join(', ')
}

export async function loadBuildHistoryExportRows(
  supabase: SupabaseClient,
  siteId: string,
): Promise<BuildHistoryExportRow[]> {
  const history = await loadSiteClaimHistory(supabase, siteId)

  const { data: cells, error: cellsError } = await supabase
    .from('price_grid')
    .select('id, plot_number, stage_id, site_stages ( stage_name, stage_order )')
    .eq('site_id', siteId)

  if (cellsError) {
    throw new Error(`Failed to load cells for export: ${cellsError.message}`)
  }

  const rows: BuildHistoryExportRow[] = []

  for (const cell of cells ?? []) {
    const entries = history[cell.id] ?? []
    if (entries.length === 0) continue

    const stageRel = cell.site_stages as
      | { stage_name: string; stage_order: number }
      | { stage_name: string; stage_order: number }[]
      | null

    const stage = Array.isArray(stageRel) ? stageRel[0] : stageRel
    const stageName = stage?.stage_name ?? '—'
    const stageOrder = stage?.stage_order ?? 0

    for (const entry of entries) {
      rows.push({
        plotNumber: cell.plot_number,
        stageName,
        stageOrder,
        cellId: cell.id,
        entry,
      })
    }
  }

  rows.sort((a, b) => {
    const byPlot = a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true })
    if (byPlot !== 0) return byPlot
    if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder
    return a.entry.periodEnd.localeCompare(b.entry.periodEnd)
  })

  return rows
}

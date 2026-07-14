import type { SupabaseClient } from '@supabase/supabase-js'
import { relationOne } from '@/lib/supabase/normalize-relations'
import { MIN_FIRESOCK_PHOTOS } from './constants'
import { isRoofCompletionStage } from './stages'
import { fetchFiresockMetByPlot } from './queries'

type PoolItem = {
  type:   string
  id:     string
  siteId?: string
}

export async function validateFiresockForClaimItems(
  supabase: SupabaseClient,
  poolItems: PoolItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gridItems = poolItems.filter((p) => p.type === 'grid_cell' && p.id)
  if (gridItems.length === 0) return { ok: true }

  const cellIds = gridItems.map((p) => p.id)

  const { data: cells, error: cellErr } = await supabase
    .from('price_grid')
    .select('id, site_id, plot_number, site_stages ( stage_name )')
    .in('id', cellIds)

  if (cellErr) return { ok: false, error: cellErr.message }
  if (!cells?.length) return { ok: true }

  const metCache = new Map<string, Map<string, boolean>>()

  for (const cell of cells) {
    const stage = relationOne(cell.site_stages as { stage_name: string } | { stage_name: string }[] | null)
    const stageName = stage?.stage_name
    if (!stageName || !isRoofCompletionStage(stageName)) continue

    const siteId = cell.site_id as string
    const plot   = cell.plot_number?.trim()
    if (!siteId || !plot) continue

    if (!metCache.has(siteId)) {
      metCache.set(siteId, await fetchFiresockMetByPlot(siteId))
    }

    const met = metCache.get(siteId)!.get(plot)
    if (met === false) {
      return {
        ok:    false,
        error: `Plot ${plot} needs at least ${MIN_FIRESOCK_PHOTOS} roof firesock photos before Roof completion can be claimed.`,
      }
    }
  }

  return { ok: true }
}

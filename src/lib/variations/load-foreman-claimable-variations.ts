import { createServiceClient } from '@/lib/supabase/server'

export type ForemanClaimableVariationGroup = {
  groupKey:    string
  description: string
  lines:       { id: string; workerName: string; amount: number }[]
  total:       number
}

/** Approved variations a foreman can include in a wage claim. */
export async function loadForemanClaimableVariations(
  foremanId: string,
  siteIds: string[]
): Promise<ForemanClaimableVariationGroup[]> {
  if (!siteIds.length) return []

  const supabase = createServiceClient()

  const { data: rawVariations } = await supabase
    .from('variation_claims')
    .select(`
      id, description, total_amount, photo_urls, site_id, foreman_id,
      workers!variation_claims_worker_id_fkey(first_name, surname, role)
    `)
    .in('site_id', siteIds)
    .eq('status', 'approved')
    .eq('foreman_id', foremanId)
    .is('claimed_in_period_id', null)
    .order('created_at', { ascending: true })

  const groupMap = new Map<string, ForemanClaimableVariationGroup>()

  for (const v of rawVariations ?? []) {
    const key = (v.photo_urls ?? [])[0] ?? v.id
    const worker = Array.isArray(v.workers) ? v.workers[0] : v.workers
    const workerName = worker
      ? `${worker.first_name} ${worker.surname}`
      : 'Worker'

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        groupKey:    key,
        description: (v.description ?? 'Variation').trim(),
        lines:       [],
        total:       0,
      })
    }

    const g = groupMap.get(key)!
    const amount = Number(v.total_amount ?? 0)
    g.lines.push({ id: v.id, workerName, amount })
    g.total += amount
  }

  return Array.from(groupMap.values())
}

import { createServiceClient } from '@/lib/supabase/server'

export type ForemanClaimableVariationGroup = {
  groupKey:    string
  description: string
  isFixedPay?: boolean
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

  const fullSelect = `
      id, description, total_amount, photo_urls, site_id, is_lump_sum,
      assigned_foreman_id, foreman_id,
      workers!variation_claims_worker_id_fkey(first_name, surname, role)
    `
  const legacySelect = `
      id, description, total_amount, photo_urls, site_id, foreman_id,
      workers!variation_claims_worker_id_fkey(first_name, surname, role)
    `

  let rawVariations: Record<string, unknown>[] | null = null

  const full = await supabase
    .from('variation_claims')
    .select(fullSelect)
    .in('site_id', siteIds)
    .eq('status', 'approved')
    .is('claimed_in_period_id', null)
    .order('created_at', { ascending: true })

  rawVariations = full.data
  if (full.error) {
    const legacy = await supabase
      .from('variation_claims')
      .select(legacySelect)
      .in('site_id', siteIds)
      .eq('status', 'approved')
      .is('claimed_in_period_id', null)
      .order('created_at', { ascending: true })
    rawVariations = legacy.data
  }

  const groupMap = new Map<string, ForemanClaimableVariationGroup>()

  for (const v of rawVariations ?? []) {
    const isLumpSum = !!(v.is_lump_sum as boolean | undefined)

    if (isLumpSum) {
      const assigned = v.assigned_foreman_id as string | null
      const legacyForeman = v.foreman_id as string | null
      if (assigned && assigned !== foremanId) continue
      if (!assigned && legacyForeman && legacyForeman !== foremanId) continue
    } else {
      if (v.foreman_id !== foremanId) continue
    }

    const key = ((v.photo_urls as string[] | null) ?? [])[0] ?? (v.id as string)
    const worker = Array.isArray(v.workers) ? v.workers[0] : v.workers
    const desc = ((v.description as string) ?? 'Variation').trim()
    const workerName = isLumpSum
      ? desc
      : worker
        ? `${worker.first_name} ${worker.surname}`
        : 'Worker'

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        groupKey:    key,
        description: desc,
        isFixedPay:  isLumpSum,
        lines:       [],
        total:       0,
      })
    }

    const g = groupMap.get(key)!
    const amount = Number(v.total_amount ?? 0)
    g.lines.push({ id: v.id as string, workerName, amount })
    g.total += amount
  }

  return Array.from(groupMap.values())
}

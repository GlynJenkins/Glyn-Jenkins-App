import { createServiceClient } from '@/lib/supabase/server'

/** Returns site IDs the foreman is assigned to. */
export async function getForemanSiteIds(foremanId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foremanId)
  return (data ?? []).map((r) => r.site_id)
}

export async function foremanHasSiteAccess(
  foremanId: string,
  siteId: string,
): Promise<boolean> {
  const ids = await getForemanSiteIds(foremanId)
  return ids.includes(siteId)
}

/** Ensure every site referenced in a multi-site claim belongs to this foreman. */
export async function foremanHasClaimSiteAccess(
  foremanId: string,
  siteId: string | null,
  poolItems: { siteId?: string; type?: string }[],
): Promise<boolean> {
  const assigned = new Set(await getForemanSiteIds(foremanId))

  if (siteId && !assigned.has(siteId)) return false

  for (const item of poolItems) {
    if (item.siteId && !assigned.has(item.siteId)) return false
  }

  return true
}

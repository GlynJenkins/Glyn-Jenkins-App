import type { PendingForemanGroup } from '../developer/_components/PendingForemanQueue'

type VariationRow = {
  id: string
  status: string
  description: string
  total_amount: number | null
  photo_urls: string[] | null
  created_at: string
  developer_submission_id: string | null
  sites: { name: string } | null
  foremen: { first_name: string; surname: string } | null
}

export function buildPendingForemanGroups(rows: VariationRow[]): PendingForemanGroup[] {
  const map = new Map<string, PendingForemanGroup & { total: number }>()

  for (const v of rows) {
    if (v.status !== 'pending' || v.developer_submission_id) continue

    const key = (v.photo_urls ?? [])[0] ?? v.id
    if (!map.has(key)) {
      map.set(key, {
        key,
        claimIds:    [],
        foremanName: v.foremen
          ? `${v.foremen.first_name} ${v.foremen.surname}`
          : 'Unknown foreman',
        siteName:    v.sites?.name ?? 'Unknown site',
        description: v.description,
        total:       0,
        submittedAt: v.created_at,
      })
    }
    const g = map.get(key)!
    g.claimIds.push(v.id)
    g.total += v.total_amount ?? 0
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .map(({ total, ...rest }) => ({ ...rest, total }))
}

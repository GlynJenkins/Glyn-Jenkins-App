import { createServiceClient } from '@/lib/supabase/server'
import { formatVariationReference } from '@/lib/variations/vo-reference'

export type VariationRegisterRow = {
  id: string
  reference: string
  siteId: string
  siteCode: string | null
  siteName: string
  description: string
  foremanTotal: number
  foremanName: string
  approvedAt: string | null
  claimed: boolean
}

type ClaimRow = {
  id: string
  description: string
  total_amount: number | null
  photo_urls: string[] | null
  approved_at: string | null
  claimed_in_period_id: string | null
  site_id: string
  sites: { name: string; site_code: string | null } | { name: string; site_code: string | null }[] | null
  foremen: { first_name: string; surname: string } | { first_name: string; surname: string }[] | null
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

/** Approved foreman variations grouped by submission — VO register. */
export async function loadVariationRegisterRows(): Promise<VariationRegisterRow[]> {
  const supabase = createServiceClient()

  const { data: claims } = await supabase
    .from('variation_claims')
    .select(`
      id, description, total_amount, photo_urls, approved_at, claimed_in_period_id, site_id,
      sites ( name, site_code ),
      foremen:workers!variation_claims_foreman_id_fkey ( first_name, surname )
    `)
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })

  type Group = {
    id: string
    siteId: string
    siteCode: string | null
    siteName: string
    description: string
    foremanTotal: number
    foremanName: string
    approvedAt: string | null
    claimed: boolean
  }

  const groupMap = new Map<string, Group>()

  for (const raw of (claims ?? []) as ClaimRow[]) {
    const key = (raw.photo_urls ?? [])[0] ?? raw.id
    const site = relationOne(raw.sites)
    const foreman = relationOne(raw.foremen)
    const foremanName = foreman
      ? `${foreman.first_name} ${foreman.surname}`
      : 'Unknown'

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id:          raw.id,
        siteId:      raw.site_id,
        siteCode:    site?.site_code ?? null,
        siteName:    site?.name ?? 'Unknown site',
        description: raw.description,
        foremanTotal: 0,
        foremanName,
        approvedAt:  raw.approved_at,
        claimed:     !!raw.claimed_in_period_id,
      })
    }

    const g = groupMap.get(key)!
    g.foremanTotal += Number(raw.total_amount ?? 0)
    if (raw.approved_at && (!g.approvedAt || raw.approved_at < g.approvedAt)) {
      g.approvedAt = raw.approved_at
    }
    if (raw.claimed_in_period_id) g.claimed = true
  }

  const groups = Array.from(groupMap.values())

  const voCounter = new Map<string, number>()
  const sortedForNumbering = [...groups].sort((a, b) => {
    const ta = a.approvedAt ? new Date(a.approvedAt).getTime() : 0
    const tb = b.approvedAt ? new Date(b.approvedAt).getTime() : 0
    return ta - tb
  })

  const referenceById = new Map<string, string>()
  for (const g of sortedForNumbering) {
    const next = (voCounter.get(g.siteId) ?? 0) + 1
    voCounter.set(g.siteId, next)
    referenceById.set(g.id, formatVariationReference(g.siteCode, next))
  }

  return groups
    .sort((a, b) => {
      const ta = a.approvedAt ? new Date(a.approvedAt).getTime() : 0
      const tb = b.approvedAt ? new Date(b.approvedAt).getTime() : 0
      return tb - ta
    })
    .map((g) => ({
      ...g,
      reference: referenceById.get(g.id) ?? '—',
    }))
}

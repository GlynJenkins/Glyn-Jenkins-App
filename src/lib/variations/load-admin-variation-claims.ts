import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'

export type AdminVariationClaim = {
  id: string
  hours: number
  rate_per_hour: number
  total_amount: number | null
  description: string
  photo_urls: string[]
  signedPhotoUrls: string[]
  status: string
  admin_rejection_reason: string | null
  is_lump_sum?: boolean
  created_at: string
  sites: { id: string; name: string } | null
  workers: { id: string; first_name: string; surname: string; role: string } | null
  foremen: { id: string; first_name: string; surname: string } | null
}

function normalizeVariation<T extends {
  sites:   { id: string; name: string } | { id: string; name: string }[] | null
  workers: { id: string; first_name: string; surname: string; role: string } | { id: string; first_name: string; surname: string; role: string }[] | null
  foremen: { id: string; first_name: string; surname: string } | { id: string; first_name: string; surname: string }[] | null
}>(v: T) {
  return {
    ...v,
    sites:   relationOne(v.sites),
    workers: relationOne(v.workers),
    foremen: relationOne(v.foremen),
  }
}

/** Foreman submissions for admin review (optionally filter by status). */
export async function loadAdminVariationClaims(
  status?: 'pending' | 'approved' | 'rejected'
): Promise<AdminVariationClaim[]> {
  const supabase = createServiceClient()

  const fullSelect = `
      id, hours, rate_per_hour, total_amount, description,
      photo_urls, status, admin_rejection_reason, created_at, is_lump_sum,
      sites   ( id, name ),
      workers!variation_claims_worker_id_fkey  ( id, first_name, surname, role ),
      foremen:workers!variation_claims_foreman_id_fkey ( id, first_name, surname )
    `
  const legacySelect = `
      id, hours, rate_per_hour, total_amount, description,
      photo_urls, status, admin_rejection_reason, created_at,
      sites   ( id, name ),
      workers!variation_claims_worker_id_fkey  ( id, first_name, surname, role ),
      foremen:workers!variation_claims_foreman_id_fkey ( id, first_name, surname )
    `

  let query = supabase.from('variation_claims').select(fullSelect).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data: rows, error } = await query

  type Row = NonNullable<typeof rows>[number]
  let variationRows: Row[] = rows ?? []

  if (error) {
    let legacyQuery = supabase.from('variation_claims').select(legacySelect).order('created_at', { ascending: false })
    if (status) legacyQuery = legacyQuery.eq('status', status)
    const { data: legacy } = await legacyQuery
    variationRows = (legacy ?? []) as Row[]
  }

  const withUrls = await Promise.all(
    variationRows.map(async (v) => {
      const urls: string[] = []
      for (const path of v.photo_urls ?? []) {
        const { data } = await supabase.storage
          .from('worker-documents')
          .createSignedUrl(path, 3600)
        if (data?.signedUrl) urls.push(data.signedUrl)
      }
      return { ...v, signedPhotoUrls: urls }
    })
  )

  return withUrls.map(normalizeVariation) as AdminVariationClaim[]
}

/** Count distinct foreman submissions (grouped by photo) awaiting approval. */
export async function countPendingVariationGroups(): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('variation_claims')
    .select('id, photo_urls')
    .eq('status', 'pending')

  return new Set((data ?? []).map((v) => (v.photo_urls ?? [])[0] ?? v.id)).size
}

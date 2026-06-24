import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import VariationList from './_components/VariationList'

export const dynamic = 'force-dynamic'

function siteFromRelation(
  sites: { id: string; name: string } | { id: string; name: string }[] | null,
): { id: string; name: string } | null {
  if (!sites) return null
  return Array.isArray(sites) ? (sites[0] ?? null) : sites
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalizeVariation<T extends {
  sites:   { id: string; name: string } | { id: string; name: string }[] | null
  workers: { id: string; first_name: string; surname: string; role: string } | { id: string; first_name: string; surname: string; role: string }[] | null
  foremen: { id: string; first_name: string; surname: string } | { id: string; first_name: string; surname: string }[] | null
}>(v: T) {
  return {
    ...v,
    sites:   siteFromRelation(v.sites),
    workers: relationOne(v.workers),
    foremen: relationOne(v.foremen),
  }
}

export default async function AdminVariationsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: variations } = await supabase
    .from('variation_claims')
    .select(`
      id, hours, rate_per_hour, total_amount, description,
      photo_urls, status, admin_rejection_reason, created_at,
      sites   ( id, name ),
      workers!variation_claims_worker_id_fkey  ( id, first_name, surname, role ),
      foremen:workers!variation_claims_foreman_id_fkey ( id, first_name, surname )
    `)
    .order('created_at', { ascending: false })

  // Generate signed URLs for photos
  const supabaseClient = createServiceClient()
  const variationsWithUrls = await Promise.all(
    (variations ?? []).map(async (v) => {
      const urls: string[] = []
      for (const path of v.photo_urls ?? []) {
        const { data } = await supabaseClient.storage
          .from('worker-documents')
          .createSignedUrl(path, 3600)
        if (data?.signedUrl) urls.push(data.signedUrl)
      }
      return { ...v, signedPhotoUrls: urls }
    })
  )

  const pending  = variationsWithUrls.filter((v) => v.status === 'pending').map(normalizeVariation)
  const approved = variationsWithUrls.filter((v) => v.status === 'approved').map(normalizeVariation)
  const rejected = variationsWithUrls.filter((v) => v.status === 'rejected').map(normalizeVariation)

  // Running spend per site (approved only)
  const siteSpend = new Map<string, { name: string; total: number }>()
  for (const v of approved) {
    const site = v.sites
    if (!site) continue
    const existing = siteSpend.get(site.id) ?? { name: site.name, total: 0 }
    siteSpend.set(site.id, { ...existing, total: existing.total + (v.total_amount ?? 0) })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Variation Claims</h1>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto space-y-5">

        {/* Running site spend */}
        {siteSpend.size > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Approved Variation Spend by Site
            </h2>
            {Array.from(siteSpend.values()).map(({ name, total }) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{name}</span>
                <span className="font-bold text-orange-600">
                  £{total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}

        <VariationList
          pending={pending}
          approved={approved}
          rejected={rejected}
        />
      </div>
    </div>
  )
}

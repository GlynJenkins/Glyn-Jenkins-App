import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import VariationList from './_components/VariationList'
import { relationOne } from '@/lib/supabase/normalize-relations'
import { buildPendingForemanGroups } from '@/lib/variations/pending-foreman-groups'

export const dynamic = 'force-dynamic'

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

export default async function AdminVariationsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: variations } = await supabase
    .from('variation_claims')
    .select(`
      id, hours, rate_per_hour, total_amount, description,
      photo_urls, status, admin_rejection_reason, created_at,
      developer_submission_id,
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

  const submissionIds = [
    ...new Set(
      variationsWithUrls
        .map((v) => v.developer_submission_id)
        .filter(Boolean)
    ),
  ] as string[]

  const statusBySubmission = new Map<string, string>()
  if (submissionIds.length > 0) {
    const { data: subs } = await supabase
      .from('variation_developer_submissions')
      .select('id, status')
      .in('id', submissionIds)
    for (const s of subs ?? []) {
      statusBySubmission.set(s.id, s.status)
    }
  }

  const enrich = (v: typeof variationsWithUrls[number]) => ({
    ...normalizeVariation(v),
    developer_submission_status: v.developer_submission_id
      ? statusBySubmission.get(v.developer_submission_id) ?? null
      : null,
  })

  const pending  = variationsWithUrls.filter((v) => v.status === 'pending').map(enrich)
  const approved = variationsWithUrls.filter((v) => v.status === 'approved').map(enrich)
  const rejected = variationsWithUrls.filter((v) => v.status === 'rejected').map(enrich)

  const pendingForemanGroups = buildPendingForemanGroups(
    pending.map((v) => ({
      id:                      v.id,
      status:                  v.status,
      description:             v.description,
      total_amount:            v.total_amount,
      photo_urls:              v.photo_urls,
      created_at:              v.created_at,
      developer_submission_id: v.developer_submission_id,
      sites:                   v.sites,
      foremen:                 v.foremen,
    }))
  )

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

        {pendingForemanGroups.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-900">
              {pendingForemanGroups.length} foreman variation{pendingForemanGroups.length === 1 ? '' : 's'} waiting
            </p>
            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Open the <strong>Pending</strong> tab below</li>
              <li>Tap <strong>Prepare developer variation</strong> on Daniel&apos;s submission</li>
              <li>Adjust hours/rates → <strong>Send to developer</strong> → <strong>Mark developer agreed</strong></li>
              <li>Then tap <strong>Approve Foreman</strong></li>
            </ol>
            <Link
              href="/admin/variations/developer"
              className="block text-center text-xs font-semibold text-blue-700 underline pt-1"
            >
              Or open Developer variations queue →
            </Link>
          </div>
        )}

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

        <Link
          href="/admin/variations/developer"
          className="block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold text-center py-3 rounded-xl transition-colors"
        >
          Developer variations queue
          {pendingForemanGroups.length > 0 && (
            <span className="ml-1.5 inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold align-middle">
              {pendingForemanGroups.length}
            </span>
          )}
        </Link>

        <VariationList
          pending={pending}
          approved={approved}
          rejected={rejected}
        />
      </div>
    </div>
  )
}

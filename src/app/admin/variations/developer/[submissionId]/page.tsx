import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { relationOne } from '@/lib/supabase/normalize-relations'
import { formatVariationReference } from '@/lib/variations/vo-reference'
import DeveloperSubmissionEditor from '../_components/DeveloperSubmissionEditor'

export const dynamic = 'force-dynamic'

export default async function DeveloperVariationDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>
}) {
  await requireAdminAccess()

  const { submissionId } = await params
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, payment_status, foreman_id, site_id,
      foreman_total, developer_total, material_uplift_enabled, vo_number,
      submitted_to_developer_at, paid_at, photo_urls,
      site_agent_name, site_agent_signed_at, site_agent_signature_path,
      source, claim_mode, plot_numbers, foreman_lump_sum, assigned_foreman_id,
      sites ( id, name, site_code )
    `)
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) notFound()

  const foremanWorkerId = submission.assigned_foreman_id ?? submission.foreman_id
  const { data: foreman } = foremanWorkerId
    ? await supabase
        .from('workers')
        .select('first_name, surname')
        .eq('id', foremanWorkerId)
        .maybeSingle()
    : { data: null }

  const { data: lines } = await supabase
    .from('variation_claims')
    .select(`
      id, hours, rate_per_hour, total_amount, worker_role,
      developer_hours, developer_rate_per_hour, is_lump_sum, lump_sum_label,
      workers!variation_claims_worker_id_fkey ( first_name, surname, role )
    `)
    .eq('developer_submission_id', submissionId)
    .order('created_at')

  let extraLines: { id: string; worker_role: string; developer_hours: number; developer_rate_per_hour: number }[] = []
  const { data: extraRows, error: extraError } = await supabase
    .from('variation_developer_lines')
    .select('id, worker_role, developer_hours, developer_rate_per_hour')
    .eq('developer_submission_id', submissionId)
    .order('created_at')

  if (!extraError) {
    extraLines = extraRows ?? []
  }

  const signedPhotoUrls: string[] = []
  for (const path of submission.photo_urls ?? []) {
    const { data } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)
    if (data?.signedUrl) signedPhotoUrls.push(data.signedUrl)
  }

  const site = relationOne(submission.sites)
  const reference = formatVariationReference(site?.site_code, submission.vo_number)

  const payload = {
    ...submission,
    reference: reference !== '—' ? reference : submission.id.slice(0, 8).toUpperCase(),
    siteAgentSigned: !!submission.site_agent_signature_path,
    sites:   site ? { ...site, id: submission.site_id } : null,
    foremen: foreman,
    signedPhotoUrls,
    lines: (lines ?? []).map((l) => ({
      ...l,
      workers: relationOne(l.workers),
    })),
    extraLines,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">{reference !== '—' ? reference : 'Developer Variation'}</h1>
          </div>
          <Link
            href="/admin/variations/developer"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Back
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <DeveloperSubmissionEditor submission={payload as never} />
      </div>
    </div>
  )
}

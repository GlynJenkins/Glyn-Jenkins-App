import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { relationOne } from '@/lib/supabase/normalize-relations'
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
      id, description, status, payment_status, foreman_id,
      foreman_total, developer_total,
      submitted_to_developer_at, paid_at, photo_urls,
      sites ( name )
    `)
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) notFound()

  const { data: foreman } = await supabase
    .from('workers')
    .select('first_name, surname')
    .eq('id', submission.foreman_id)
    .maybeSingle()

  const { data: lines } = await supabase
    .from('variation_claims')
    .select(`
      id, hours, rate_per_hour, total_amount,
      developer_hours, developer_rate_per_hour,
      workers!variation_claims_worker_id_fkey ( first_name, surname, role )
    `)
    .eq('developer_submission_id', submissionId)
    .order('created_at')

  const signedPhotoUrls: string[] = []
  for (const path of submission.photo_urls ?? []) {
    const { data } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)
    if (data?.signedUrl) signedPhotoUrls.push(data.signedUrl)
  }

  const payload = {
    ...submission,
    sites:   relationOne(submission.sites),
    foremen: foreman,
    signedPhotoUrls,
    lines: (lines ?? []).map((l) => ({
      ...l,
      workers: relationOne(l.workers),
    })),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Developer Variation</h1>
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

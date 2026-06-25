import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { relationOne } from '@/lib/supabase/normalize-relations'
import DeveloperSubmissionList from './_components/DeveloperSubmissionList'
import PendingForemanQueue from './_components/PendingForemanQueue'
import DeveloperVariationRegister from './_components/DeveloperVariationRegister'
import { buildPendingForemanGroups } from '@/lib/variations/pending-foreman-groups'
import { loadDeveloperRegisterRows } from '@/lib/variations/submission-totals'

export const dynamic = 'force-dynamic'

export default async function DeveloperVariationsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: submissions } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, payment_status, foreman_id,
      foreman_total, developer_total,
      submitted_to_developer_at, paid_at, created_at,
      sites ( id, name )
    `)
    .order('created_at', { ascending: false })

  const normalized = await Promise.all((submissions ?? []).map(async (s) => {
    const { data: foreman } = await supabase
      .from('workers')
      .select('first_name, surname')
      .eq('id', s.foreman_id)
      .maybeSingle()
    return {
      ...s,
      sites:   relationOne(s.sites),
      foremen: foreman,
    }
  }))

  const { data: pendingRows } = await supabase
    .from('variation_claims')
    .select(`
      id, status, description, total_amount, photo_urls, created_at,
      developer_submission_id,
      sites ( name ),
      foremen:workers!variation_claims_foreman_id_fkey ( first_name, surname )
    `)
    .eq('status', 'pending')
    .is('developer_submission_id', null)
    .order('created_at', { ascending: false })

  const pendingForemanGroups = buildPendingForemanGroups(
    (pendingRows ?? []).map((v) => ({
      id:                      v.id,
      status:                  v.status,
      description:             v.description,
      total_amount:            v.total_amount,
      photo_urls:              v.photo_urls,
      created_at:              v.created_at,
      developer_submission_id: v.developer_submission_id,
      sites:                   relationOne(v.sites),
      foremen:                 relationOne(v.foremen),
    }))
  )

  const registerRows = await loadDeveloperRegisterRows()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Developer Variations</h1>
            <p className="text-slate-400 text-xs mt-1">Admin &amp; management only</p>
          </div>
          <Link
            href="/admin/variations"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Variations
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <PendingForemanQueue groups={pendingForemanGroups} />
        <DeveloperVariationRegister rows={registerRows} />
        <DeveloperSubmissionList submissions={normalized as never} />
      </div>
    </div>
  )
}

import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import PendingForemanQueue from './_components/PendingForemanQueue'
import DeveloperVariationRegisterTable from './_components/DeveloperVariationRegisterTable'
import { buildPendingForemanGroups } from '@/lib/variations/pending-foreman-groups'
import { loadDeveloperRegisterRows } from '@/lib/variations/submission-totals'
import { loadSiteVariationAccountSummaries } from '@/lib/variations/site-variation-accounts'
import { relationOne } from '@/lib/supabase/normalize-relations'

export const dynamic = 'force-dynamic'

export default async function DeveloperVariationsPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

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
  const siteAccounts = await loadSiteVariationAccountSummaries()
  const siteCount = siteAccounts.length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Developer Variations</h1>
            <p className="text-slate-400 text-xs mt-1">VO register</p>
          </div>
          <Link
            href="/admin/variations"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Variations
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto space-y-4">
        <PendingForemanQueue groups={pendingForemanGroups} />

        <Link
          href="/admin/variations/developer/sites"
          className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-orange-200 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Site variation accounts</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {siteCount === 0
                  ? 'View pending, paid, and profit by site'
                  : `${siteCount} site${siteCount === 1 ? '' : 's'} with variations`}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
        </Link>

        <DeveloperVariationRegisterTable rows={registerRows} />
      </div>
    </div>
  )
}

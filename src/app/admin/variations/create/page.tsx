import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import NewAdminVariationForm from '../_components/NewAdminVariationForm'

export const dynamic = 'force-dynamic'

export default async function CreateVariationPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: activeSites } = await supabase
    .from('sites')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const { data: foremen } = await supabase
    .from('workers')
    .select('id, first_name, surname')
    .eq('role', 'foreman')
    .eq('status', 'active')
    .order('surname')

  const { data: siteWorkers } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .in('role', ['bricklayer', 'labourer', 'apprentice'])
    .eq('status', 'active')
    .order('surname')

  const { data: siteForemanAssignments } = await supabase
    .from('foreman_site_assignments')
    .select('site_id, foreman_id')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Create variation</h1>
            <p className="text-slate-400 text-xs mt-1">
              Auto-approved · optional foreman assignment
            </p>
          </div>
          <Link
            href="/admin/variations"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            ← Back
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <NewAdminVariationForm
          sites={activeSites ?? []}
          foremen={foremen ?? []}
          workers={siteWorkers ?? []}
          siteForemanAssignments={siteForemanAssignments ?? []}
        />
      </div>
    </div>
  )
}

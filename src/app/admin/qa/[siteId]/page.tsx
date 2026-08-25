import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import QaInspectionGrid from './_components/QaInspectionGrid'

export const dynamic = 'force-dynamic'

export default async function AdminQaSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { worker } = await requireManagementAreaAccess()
  const { siteId } = await params
  const supabase = createServiceClient()

  let grid: Awaited<ReturnType<typeof fetchQaSiteGrid>> | null = null
  try {
    grid = await fetchQaSiteGrid(siteId)
  } catch {
    notFound()
  }

  const { data: assignments } = await supabase
    .from('foreman_site_assignments')
    .select('foreman_id')
    .eq('site_id', siteId)

  const foremanIds = (assignments ?? []).map((a) => a.foreman_id)
  let assignedForemen: { id: string; name: string }[] = []
  if (foremanIds.length > 0) {
    const { data: foremen } = await supabase
      .from('workers')
      .select('id, first_name, surname')
      .in('id', foremanIds)
      .order('surname')
    assignedForemen = (foremen ?? []).map((f) => ({
      id: f.id,
      name: `${f.first_name} ${f.surname}`.trim(),
    }))
  }

  const inspectorDefault = worker
    ? `${worker.first_name} ${worker.surname}`
    : 'Inspector'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/admin/qa"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
          >
            ← Quality checks
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">{grid!.site_name}</h1>
          <p className="text-slate-400 text-xs mt-0.5">Inspection log by plot &amp; stage</p>
          {assignedForemen.length > 0 ? (
            <p className="text-slate-500 text-xs mt-1">
              Site foreman{assignedForemen.length === 1 ? '' : 'en'}:{' '}
              {assignedForemen.map((f) => f.name).join(', ')}
            </p>
          ) : (
            <p className="text-amber-400/90 text-xs mt-1">
              No foreman assigned to this site — snags won&apos;t reach anyone until you assign one under Sites.
            </p>
          )}
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        <QaInspectionGrid
          initialGrid={grid!}
          inspectorDefault={inspectorDefault}
          assignedForemen={assignedForemen}
        />
      </div>
    </div>
  )
}

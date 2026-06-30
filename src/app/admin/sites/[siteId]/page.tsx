import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SiteGrid from './_components/SiteGrid'
import ExcelImporter from './_components/ExcelImporter'
import ForemanAssignments from './_components/ForemanAssignments'
import ClearGridButton from './_components/ClearGridButton'
import { formatSiteCode } from '@/lib/variations/vo-reference'

export const dynamic = 'force-dynamic'

export default async function AdminSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params
  await requireAdminAccess()

  const supabase   = createServiceClient()

  const { data: site } = await supabase
    .from('sites')
    .select('id, name, address, is_active, site_code')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) notFound()

  const { data: stages } = await supabase
    .from('site_stages')
    .select('id, stage_name, stage_order')
    .eq('site_id', siteId)
    .order('stage_order')

  // Supabase has a server-side row cap (~1000). Fetch all cells in pages.
  const allCells: {
    id: string; plot_number: string; stage_id: string
    contract_value: number | null; current_balance: number | null
    cell_color: string; override_note: string | null; total_claimed_pct: number
  }[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: page, error } = await supabase
      .from('price_grid')
      .select('id, plot_number, stage_id, contract_value, current_balance, cell_color, override_note, total_claimed_pct')
      .eq('site_id', siteId)
      .range(from, from + PAGE - 1)
    if (error || !page || page.length === 0) break
    allCells.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  const cells = allCells

  const hasData = (stages?.length ?? 0) > 0

  // ── Foreman assignments ──────────────────────────────────────────────
  const { data: assignments } = await supabase
    .from('foreman_site_assignments')
    .select('foreman_id')
    .eq('site_id', siteId)

  const assignedIds = (assignments ?? []).map((a) => a.foreman_id)

  const { data: assignedForemen } = assignedIds.length > 0
    ? await supabase.from('workers').select('id, first_name, surname').in('id', assignedIds).order('surname')
    : { data: [] }

  const { data: allForemen } = await supabase
    .from('workers')
    .select('id, first_name, surname')
    .eq('role', 'foreman')
    .eq('status', 'active')
    .order('surname')

  const availableForemen = (allForemen ?? []).filter((f) => !assignedIds.includes(f.id))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link
                href="/admin/sites"
                className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
              >
                ← All Sites
              </Link>
              <h1 className="text-xl font-bold text-white mt-1">
                <span className="text-orange-400 mr-2">{formatSiteCode(site.site_code)}</span>
                {site.name}
              </h1>
              {site.address && (
                <p className="text-slate-400 text-sm">{site.address}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasData && (
                <Link
                  href={`/admin/sites/${siteId}/jetwash`}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Jetwash
                </Link>
              )}
              {hasData && <ClearGridButton siteId={siteId} />}
              <ExcelImporter siteId={siteId} />
            </div>
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto space-y-5">

        <ForemanAssignments
          siteId={siteId}
          assignedForemen={assignedForemen ?? []}
          availableForemen={availableForemen}
        />

        {hasData && (
          <Link
            href={`/admin/sites/${siteId}/jetwash`}
            className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-orange-200 transition-colors"
          >
            <div>
              <p className="font-semibold text-slate-900">Jetwash progress</p>
              <p className="text-xs text-slate-500 mt-0.5">View which plots have been washed on this site</p>
            </div>
            <span className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl shrink-0">
              View
            </span>
          </Link>
        )}

        {!hasData ? (
          <div className="text-center py-24 text-slate-400 space-y-3">
            <div className="text-5xl">📊</div>
            <p className="font-medium text-slate-600">No grid data yet</p>
            <p className="text-sm max-w-xs mx-auto">
              Use the <strong className="text-orange-600">Import Excel</strong> button above to upload your
              price grid. Column A should be Plot No; all other columns become work stages.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { color: 'bg-white border border-gray-300', label: 'Not Started' },
                { color: 'bg-orange-300',                   label: 'In Progress' },
                { color: 'bg-blue-400',                     label: 'Complete'    },
                { color: 'bg-green-400',                    label: 'Certified'   },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded ${color}`} />
                  <span className="text-slate-600">{label}</span>
                </div>
              ))}
              <span className="text-slate-400 ml-2">Tap any cell to edit</span>
            </div>

            <SiteGrid
              stages={stages ?? []}
              cells={(cells ?? []).map((c) => ({ ...c, total_claimed_pct: c.total_claimed_pct ?? 0 }))}
            />
          </div>
        )}
      </div>
    </div>
  )
}

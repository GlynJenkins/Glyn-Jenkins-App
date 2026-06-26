import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { fetchQaSiteSummaries } from '@/lib/qa/queries'
import QaSiteList from './_components/QaSiteList'

export const dynamic = 'force-dynamic'

export default async function AdminQaPage() {
  await requireAdminAccess()

  let sites: Awaited<ReturnType<typeof fetchQaSiteSummaries>> = []
  let setupRequired = false

  try {
    sites = await fetchQaSiteSummaries(false)
  } catch {
    setupRequired = true
  }

  const totalSlots = sites.reduce((n, s) => n + s.total_slots, 0)
  const completed = sites.reduce((n, s) => n + s.completed_slots, 0)
  const overallPct = totalSlots ? Math.round((completed / totalSlots) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Quality checks</h1>
            {!setupRequired && totalSlots > 0 && (
              <p className="text-slate-400 text-xs mt-1">
                {completed} of {totalSlots} inspections complete · {overallPct}% overall
              </p>
            )}
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        {setupRequired ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
            <p className="font-semibold">Database setup required</p>
            <p className="mt-2 text-amber-800">
              Run <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">add_qa_inspections.sql</code>{' '}
              in Supabase, then refresh.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">
              Each site mirrors the uploaded price grid. Description columns come from spreadsheet
              fields before 1st lift. Tap Joist lift, Plate/Roof, Pre plaster, or CML to inspect a plot.
            </p>
            <QaSiteList sites={sites} />
          </>
        )}
      </div>
    </div>
  )
}

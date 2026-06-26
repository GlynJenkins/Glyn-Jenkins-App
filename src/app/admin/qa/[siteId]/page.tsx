import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import QaInspectionGrid from './_components/QaInspectionGrid'

export const dynamic = 'force-dynamic'

export default async function AdminQaSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { worker } = await requireAdminAccess()
  const { siteId } = await params

  let grid: Awaited<ReturnType<typeof fetchQaSiteGrid>> | null = null
  try {
    grid = await fetchQaSiteGrid(siteId)
  } catch {
    notFound()
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
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto">
        <QaInspectionGrid initialGrid={grid!} inspectorDefault={inspectorDefault} />
      </div>
    </div>
  )
}

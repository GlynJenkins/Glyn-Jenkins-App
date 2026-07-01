import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { Plus, ClipboardList } from 'lucide-react'
import VariationRegisterTable from './_components/VariationRegisterTable'
import { loadVariationRegisterRows } from '@/lib/variations/load-variation-register-rows'
import { countPendingVariationGroups } from '@/lib/variations/load-admin-variation-claims'

export const dynamic = 'force-dynamic'

export default async function AdminVariationsPage() {
  await requireAdminAccess()

  const [registerRows, pendingCount] = await Promise.all([
    loadVariationRegisterRows(),
    countPendingVariationGroups(),
  ])

  const registerTotal = registerRows.reduce((sum, r) => sum + r.foremanTotal, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Variations</h1>
            <p className="text-slate-400 text-xs mt-1">VO register</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin/variations/pending"
              className="relative px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Pending</span>
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </Link>
            <Link
              href="/admin/variations/create"
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create</span>
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              ← Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-5xl mx-auto space-y-4">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:hidden">
          <Link
            href="/admin/variations/pending"
            className="relative flex items-center justify-center gap-2 py-3.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Pending approvals
            {pendingCount > 0 && (
              <span className="ml-1 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/variations/create"
            className="flex items-center justify-center gap-2 py-3.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create variation
          </Link>
        </div>

        {pendingCount > 0 && (
          <Link
            href="/admin/variations/pending"
            className="hidden sm:flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl p-4 hover:border-amber-300 transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {pendingCount} foreman submission{pendingCount === 1 ? '' : 's'} awaiting approval
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Tap to review — approved items appear in the register below.
              </p>
            </div>
            <span className="text-amber-700 text-sm font-semibold shrink-0">Review →</span>
          </Link>
        )}

        {registerRows.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Approved VOs</p>
              <p className="text-base font-bold text-slate-700">{registerRows.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total foreman cost</p>
              <p className="text-base font-bold text-orange-600">
                £{registerTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        <VariationRegisterTable rows={registerRows} />
      </div>
    </div>
  )
}

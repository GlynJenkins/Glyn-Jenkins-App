import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import VariationList from '../_components/VariationList'
import { loadAdminVariationClaims } from '@/lib/variations/load-admin-variation-claims'

export const dynamic = 'force-dynamic'

export default async function PendingVariationsPage() {
  await requireAdminAccess()

  const pending = await loadAdminVariationClaims('pending')
  const rejected = await loadAdminVariationClaims('rejected')
  const pendingGroups = new Set(pending.map((v) => (v.photo_urls ?? [])[0] ?? v.id)).size

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Pending approvals</h1>
            <p className="text-slate-400 text-xs mt-1">
              {pendingGroups > 0
                ? `${pendingGroups} foreman submission${pendingGroups === 1 ? '' : 's'} to review`
                : 'Foreman daywork awaiting approval'}
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
        <VariationList
          pending={pending}
          approved={[]}
          rejected={rejected}
          defaultTab="pending"
        />
      </div>
    </div>
  )
}

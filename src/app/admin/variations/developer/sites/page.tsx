import { requireAdminAccess } from '@/lib/auth/portal-access'
import { loadSiteVariationAccountSummaries } from '@/lib/variations/site-variation-accounts'
import Link from 'next/link'
import SiteVariationAccountList from '../_components/SiteVariationAccountList'

export const dynamic = 'force-dynamic'

export default async function DeveloperVariationSitesPage() {
  await requireAdminAccess()

  const siteAccounts = await loadSiteVariationAccountSummaries()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href="/admin/variations/developer"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
          >
            ← VO register
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Site variation accounts</h1>
          <p className="text-slate-400 text-xs mt-1">
            Pending, paid, and profit broken down by site
          </p>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <SiteVariationAccountList accounts={siteAccounts} />
      </div>
    </div>
  )
}

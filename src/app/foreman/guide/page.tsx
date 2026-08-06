import Link from 'next/link'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { GUIDE_PDF_HREF, loadGuideMarkdown } from '@/lib/guides/load-guide'
import GuideView from '@/components/guides/GuideView'
import PortalHeader from '@/components/PortalHeader'

export const dynamic = 'force-dynamic'

export default async function ForemanGuidePage() {
  await requireForemanAccess()
  const markdown = await loadGuideMarkdown('foreman')

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader>
        <div className="flex items-center justify-between max-w-lg mx-auto gap-3">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">How-to Guide</h1>
            <p className="text-slate-400 text-sm">Foreman</p>
          </div>
          <Link
            href="/foreman"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors shrink-0"
          >
            ← Home
          </Link>
        </div>
      </PortalHeader>

      <main className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <GuideView markdown={markdown} pdfHref={GUIDE_PDF_HREF.foreman} />
      </main>
    </div>
  )
}

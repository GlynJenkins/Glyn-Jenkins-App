import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import SiteAuditsListClient from './_components/SiteAuditsListClient'

export const dynamic = 'force-dynamic'

export default async function SiteAuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  await requireManagementAreaAccess()
  const { siteId } = await searchParams

  const supabase = createServiceClient()

  if (!siteId) {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name')

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-slate-900 px-5 pt-12 pb-6">
          <div className="max-w-lg mx-auto">
            <Link href="/admin" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Site Audits</h1>
            <p className="text-slate-400 text-sm mt-0.5">Choose a site to walk</p>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 pt-5 pb-16 space-y-2">
          {(sites ?? []).map((site) => (
            <Link
              key={site.id}
              href={`/admin/site-audits?siteId=${site.id}`}
              className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm
                         font-semibold text-slate-900 hover:border-orange-200"
            >
              {site.name}
            </Link>
          ))}
          {!sites?.length && (
            <p className="text-sm text-slate-400 text-center py-12">No active sites.</p>
          )}
        </main>
      </div>
    )
  }

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) redirect('/admin/site-audits')

  const { data: audits } = await supabase
    .from('site_audits')
    .select(`
      id, audited_by_name, audited_by_role, audit_date, status, pdf_path,
      site_audit_items ( id )
    `)
    .eq('site_id', siteId)
    .order('audit_date', { ascending: false })

  const list = (audits ?? []).map((a) => ({
    id:            a.id,
    auditedByName: a.audited_by_name,
    auditedByRole: a.audited_by_role,
    auditDate:     a.audit_date,
    status:        a.status,
    pdfReady:      !!a.pdf_path,
    itemCount:     Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
  }))

  const draft = list.find((a) => a.status === 'draft') ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href={`/admin/sites/${siteId}`}
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase"
          >
            ← {site.name}
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Site Audits</h1>
          <p className="text-slate-400 text-sm mt-0.5">{site.name}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <SiteAuditsListClient
          siteId={siteId}
          siteName={site.name}
          audits={list}
          draft={draft}
        />
      </main>
    </div>
  )
}

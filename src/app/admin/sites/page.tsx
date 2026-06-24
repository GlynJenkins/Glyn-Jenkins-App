import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import Link from 'next/link'
import { Building2, ChevronRight, MapPin } from 'lucide-react'
import NewSiteButton from './_components/NewSiteButton'

export const dynamic = 'force-dynamic'

export default async function AdminSitesPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, address, is_active, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">All Sites</h1>
          </div>
          <div className="flex items-center gap-2">
            <NewSiteButton />
            <Link
              href="/admin"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              ← Workers
            </Link>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 space-y-3 max-w-lg mx-auto">
        {(!sites || sites.length === 0) && (
          <div className="text-center py-16 text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No sites yet. Import an Excel file to create your first site.</p>
          </div>
        )}

        {sites?.map((site) => (
          <Link
            key={site.id}
            href={`/admin/sites/${site.id}`}
            className="flex items-center justify-between bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-orange-200 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{site.name}</p>
                {site.address && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {site.address}
                  </div>
                )}
                <span className={`text-xs font-medium mt-1 inline-block ${site.is_active ? 'text-green-600' : 'text-slate-400'}`}>
                  {site.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { loadCompanyBranding } from '@/lib/documents/company-branding'
import { createServiceClient } from '@/lib/supabase/server'
import CompanySettingsForm from './_components/CompanySettingsForm'

export const dynamic = 'force-dynamic'

export default async function CompanySettingsPage() {
  await requireAdminAccess()

  const branding = await loadCompanyBranding()
  let logoUrl: string | null = null

  if (branding.logoStoragePath) {
    const supabase = createServiceClient()
    const { data } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(branding.logoStoragePath, 3600)
    logoUrl = data?.signedUrl ?? null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <Link
              href="/admin/settings"
              className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
            >
              ← Admin Settings
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Company & Documents</h1>
            <p className="text-slate-400 text-sm mt-0.5">Branding for PDFs and variations</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <CompanySettingsForm
          initial={{
            company_name:    branding.companyName,
            company_address: branding.address ?? '',
            company_phone:   branding.phone ?? '',
            company_email:   branding.email ?? '',
            company_number:  branding.companyNumber ?? '',
            vat_number:      branding.vatNumber ?? '',
            logo_url:        logoUrl,
          }}
        />
      </div>
    </div>
  )
}

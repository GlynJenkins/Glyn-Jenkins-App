import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { loadCompanyBranding } from '@/lib/documents/company-branding'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  const branding = await loadCompanyBranding()
  let logoUrl: string | null = null

  if (branding.logoStoragePath) {
    const supabase = createServiceClient()
    const { data } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(branding.logoStoragePath, 3600)
    logoUrl = data?.signedUrl ?? null
  }

  return NextResponse.json({
    company_name:    branding.companyName,
    company_address: branding.address,
    company_phone:   branding.phone,
    company_email:   branding.email,
    company_number:  branding.companyNumber,
    vat_number:      branding.vatNumber,
    logo_url:        logoUrl,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as {
      company_name?:    string
      company_address?: string | null
      company_phone?:   string | null
      company_email?:   string | null
      company_number?:  string | null
      vat_number?:      string | null
    }

    const companyName = body.company_name?.trim()
    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const payload = {
      company_name:    companyName,
      company_address: body.company_address?.trim() || null,
      company_phone:   body.company_phone?.trim() || null,
      company_email:   body.company_email?.trim() || null,
      company_number:  body.company_number?.trim() || null,
      vat_number:      body.vat_number?.trim() || null,
      updated_at:      new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('admin_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = existing?.id
      ? await supabase.from('admin_settings').update(payload).eq('id', existing.id)
      : await supabase.from('admin_settings').insert(payload)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

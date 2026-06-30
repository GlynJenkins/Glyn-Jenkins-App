import { createServiceClient } from '@/lib/supabase/server'

export type CompanyBranding = {
  companyName:    string
  address:        string | null
  phone:          string | null
  email:          string | null
  companyNumber:  string | null
  vatNumber:      string | null
  logoStoragePath: string | null
  logoBytes:      Buffer | null
  logoMime:       'image/png' | 'image/jpeg' | null
}

export type SiteDocumentDetails = {
  documentAddress:   string | null
  developerName:     string | null
  developerContact:  string | null
  surveyorName:      string | null
  documentReference: string | null
}

const DEFAULT_COMPANY_NAME = 'Glyn Jenkins LTD'

export async function loadCompanyBranding(): Promise<CompanyBranding> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('admin_settings')
    .select(`
      company_name, company_address, company_phone, company_email,
      company_number, vat_number, logo_storage_path
    `)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const branding: CompanyBranding = {
    companyName:     data?.company_name?.trim() || DEFAULT_COMPANY_NAME,
    address:         data?.company_address?.trim() || null,
    phone:           data?.company_phone?.trim() || null,
    email:           data?.company_email?.trim() || null,
    companyNumber:   data?.company_number?.trim() || null,
    vatNumber:       data?.vat_number?.trim() || null,
    logoStoragePath: data?.logo_storage_path ?? null,
    logoBytes:       null,
    logoMime:          null,
  }

  if (data?.logo_storage_path) {
    const { data: blob, error } = await supabase.storage
      .from('worker-documents')
      .download(data.logo_storage_path)

    if (!error && blob) {
      const bytes = Buffer.from(await blob.arrayBuffer())
      const path = data.logo_storage_path.toLowerCase()
      branding.logoBytes = bytes
      branding.logoMime  = path.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }
  }

  return branding
}

export function parseSiteDocumentDetails(site: {
  document_address?: string | null
  developer_name?: string | null
  developer_contact?: string | null
  surveyor_name?: string | null
  document_reference?: string | null
} | null): SiteDocumentDetails {
  return {
    documentAddress:   site?.document_address?.trim() || null,
    developerName:     site?.developer_name?.trim() || null,
    developerContact:  site?.developer_contact?.trim() || null,
    surveyorName:      site?.surveyor_name?.trim() || null,
    documentReference: site?.document_reference?.trim() || null,
  }
}

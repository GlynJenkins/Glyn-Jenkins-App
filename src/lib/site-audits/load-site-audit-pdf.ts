import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import { loadCompanyBranding, parseSiteDocumentDetails } from '@/lib/documents/company-branding'
import {
  generateSiteAuditPdf,
  siteAuditPdfFilename,
  type SiteAuditPdfItem,
} from '@/lib/site-audits/generate-site-audit-pdf'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  management: 'Management',
  foreman: 'Foreman',
  contracts_manager: 'Contracts Manager',
  site_supervisor: 'Site Supervisor',
  bricklayer: 'Bricklayer',
  labourer: 'Labourer',
  apprentice: 'Apprentice',
  jetwasher: 'Jetwasher',
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role
}

export async function loadSiteAuditPdfBuffer(auditId: string): Promise<{
  buffer: Buffer
  filename: string
  siteName: string
  pdfPath: string
} | { error: string; status: number }> {
  const supabase = createServiceClient()

  const { data: audit, error } = await supabase
    .from('site_audits')
    .select(`
      id, site_id, audited_by_name, audited_by_role, audit_date,
      general_notes, status, pdf_path
    `)
    .eq('id', auditId)
    .maybeSingle()

  if (error) return { error: 'Could not load audit.', status: 500 }
  if (!audit) return { error: 'Audit not found.', status: 404 }

  if (audit.pdf_path && audit.status === 'completed') {
    const { data: file, error: dlError } = await supabase.storage
      .from('worker-documents')
      .download(audit.pdf_path)
    if (!dlError && file) {
      const { data: site } = await supabase
        .from('sites')
        .select('name, site_code')
        .eq('id', audit.site_id)
        .maybeSingle()
      const buffer = Buffer.from(await file.arrayBuffer())
      return {
        buffer,
        filename: siteAuditPdfFilename({
          siteCode: site?.site_code ?? null,
          siteName: site?.name ?? 'site',
          auditDate: new Date(audit.audit_date),
        }),
        siteName: site?.name ?? 'Site',
        pdfPath: audit.pdf_path,
      }
    }
  }

  const built = await buildAndStoreSiteAuditPdf(auditId)
  if ('error' in built) return built
  return built
}

/** Generate PDF from current items/photos, upload, return buffer. */
export async function buildAndStoreSiteAuditPdf(auditId: string): Promise<{
  buffer: Buffer
  filename: string
  siteName: string
  pdfPath: string
} | { error: string; status: number }> {
  const supabase = createServiceClient()

  const { data: audit } = await supabase
    .from('site_audits')
    .select(`
      id, site_id, audited_by_name, audited_by_role, audit_date, general_notes
    `)
    .eq('id', auditId)
    .maybeSingle()

  if (!audit) return { error: 'Audit not found.', status: 404 }

  const { data: site } = await supabase
    .from('sites')
    .select(`
      id, name, site_code, address,
      document_address, developer_name, developer_contact,
      surveyor_name, document_reference
    `)
    .eq('id', audit.site_id)
    .maybeSingle()

  if (!site) return { error: 'Site not found.', status: 404 }

  const { data: items } = await supabase
    .from('site_audit_items')
    .select('id, plot_number, description, sort_order')
    .eq('audit_id', auditId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!items?.length) {
    return {
      error: 'Add at least one item — or if the site was clean, add a single item saying so.',
      status: 400,
    }
  }

  const itemIds = items.map((i) => i.id)
  const { data: photos } = await supabase
    .from('site_audit_photos')
    .select('id, item_id, photo_path')
    .in('item_id', itemIds)
    .order('created_at', { ascending: true })

  const photosByItem = new Map<string, { photo_path: string }[]>()
  for (const p of photos ?? []) {
    const list = photosByItem.get(p.item_id) ?? []
    list.push(p)
    photosByItem.set(p.item_id, list)
  }

  const pdfItems: SiteAuditPdfItem[] = []
  for (const item of items) {
    const embedded: SiteAuditPdfItem['photos'] = []
    for (const p of photosByItem.get(item.id) ?? []) {
      const { data: file } = await supabase.storage
        .from('worker-documents')
        .download(p.photo_path)
      if (!file) continue
      try {
        const raw = Buffer.from(await file.arrayBuffer())
        const normalized = await normalizePhotoForPdf(raw)
        embedded.push({ bytes: normalized.buffer, mime: normalized.mime })
      } catch {
        /* skip unreadable photo */
      }
    }
    pdfItems.push({
      plotNumber:  item.plot_number,
      description: item.description,
      photos:      embedded,
    })
  }

  const company = await loadCompanyBranding()
  const buffer = await generateSiteAuditPdf({
    company,
    siteName:       site.name,
    siteCode:       site.site_code,
    siteAddress:    site.address,
    siteDocuments:  parseSiteDocumentDetails(site),
    auditedByName:  audit.audited_by_name,
    auditedByRole:  audit.audited_by_role,
    auditDate:      new Date(audit.audit_date),
    generalNotes:   audit.general_notes,
    items:          pdfItems,
  })

  const filename = siteAuditPdfFilename({
    siteCode:  site.site_code,
    siteName:  site.name,
    auditDate: new Date(audit.audit_date),
  })
  const pdfPath = `site-audits/${auditId}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from('worker-documents')
    .upload(pdfPath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return { error: `PDF upload failed: ${uploadError.message}`, status: 500 }
  }

  await supabase
    .from('site_audits')
    .update({ pdf_path: pdfPath })
    .eq('id', auditId)

  return {
    buffer,
    filename,
    siteName: site.name,
    pdfPath,
  }
}

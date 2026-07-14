import { createServiceClient } from '@/lib/supabase/server'
import {
  loadCompanyBranding,
  parseSiteDocumentDetails,
} from '@/lib/documents/company-branding'
import { fetchFiresockSiteGrid } from './queries'
import { generateFiresockSitePdf, type FiresockPdfPhoto } from './generate-site-pdf'

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

async function downloadStorageFile(path: string): Promise<Buffer | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from('worker-documents').download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function loadFiresockSitePdf(siteId: string): Promise<Buffer | null> {
  const supabase = createServiceClient()

  const { data: site } = await supabase
    .from('sites')
    .select(`
      id, name,
      document_address, developer_name, developer_contact,
      surveyor_name, document_reference
    `)
    .eq('id', siteId)
    .maybeSingle()

  if (!site) return null

  const grid = await fetchFiresockSiteGrid(siteId)
  const company = await loadCompanyBranding()

  const plots = []

  for (const plot of grid.plots) {
    const photos: FiresockPdfPhoto[] = []
    for (let i = 0; i < plot.photos.length; i++) {
      const rec = plot.photos[i]!
      const buffer = await downloadStorageFile(rec.photo_path)
      if (!buffer) continue
      photos.push({
        label:  `Photo ${i + 1}`,
        buffer,
        mime:   mimeFromPath(rec.photo_path),
      })
    }

    plots.push({
      plotNumber:  plot.plot_number,
      details:     plot.details,
      photos,
      evidenceMet: plot.evidence_met,
    })
  }

  return generateFiresockSitePdf({
    siteName:       site.name,
    siteDocuments:  parseSiteDocumentDetails(site),
    company,
    generatedAt:    new Date(),
    plots,
  })
}

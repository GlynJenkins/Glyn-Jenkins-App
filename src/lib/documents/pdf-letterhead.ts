import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { CompanyBranding, SiteDocumentDetails } from './company-branding'

const PAGE_WIDTH = 595.28
const MARGIN     = 50
const LINE_HEIGHT = 13
const LOGO_MAX_H  = 52
const LOGO_MAX_W  = 120

const COLOR_ORANGE = rgb(0.92, 0.45, 0.13)
const COLOR_MUTED  = rgb(0.45, 0.45, 0.45)
const COLOR_TEXT   = rgb(0.12, 0.12, 0.12)

export type PdfLetterheadOptions = {
  documentTitle: string
  company: CompanyBranding
  site?: SiteDocumentDetails & { siteName?: string; siteCode?: string | null }
  reference?: string
}

function wrapAddress(address: string): string[] {
  return address.split(/\n+/).map((l) => l.trim()).filter(Boolean)
}

async function embedLogo(pdf: PDFDocument, company: CompanyBranding) {
  if (!company.logoBytes || !company.logoMime) return null
  try {
    return company.logoMime === 'image/png'
      ? await pdf.embedPng(company.logoBytes)
      : await pdf.embedJpg(company.logoBytes)
  } catch {
    return null
  }
}

/** Draw branded header; returns Y position below the header block. */
export async function drawPdfLetterhead(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  startY: number,
  opts: PdfLetterheadOptions
): Promise<number> {
  const { company, site, documentTitle, reference } = opts
  let y = startY
  const textX = MARGIN + LOGO_MAX_W + 16

  const logo = await embedLogo(pdf, company)
  if (logo) {
    const scale = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    page.drawImage(logo, {
      x: MARGIN,
      y: y - h + 4,
      width: w,
      height: h,
    })
  }

  const drawCompanyLine = (text: string, bold = false, size = 9) => {
    page.drawText(text, {
      x: logo ? textX : MARGIN,
      y,
      size,
      font: bold ? fontBold : font,
      color: bold ? COLOR_TEXT : COLOR_MUTED,
    })
    y -= LINE_HEIGHT
  }

  drawCompanyLine(company.companyName, true, 14)
  for (const line of wrapAddress(company.address ?? '')) {
    drawCompanyLine(line)
  }
  const contactParts = [company.phone, company.email].filter(Boolean)
  if (contactParts.length) drawCompanyLine(contactParts.join('  ·  '))
  const regParts = [
    company.companyNumber ? `Co. ${company.companyNumber}` : null,
    company.vatNumber ? `VAT ${company.vatNumber}` : null,
  ].filter(Boolean)
  if (regParts.length) drawCompanyLine(regParts.join('  ·  '))

  y -= 6
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_WIDTH - MARGIN, y },
    thickness: 2,
    color: COLOR_ORANGE,
  })
  y -= 16

  page.drawText(documentTitle, {
    x: MARGIN,
    y,
    size: 12,
    font: fontBold,
    color: COLOR_TEXT,
  })
  y -= LINE_HEIGHT + 4

  if (site?.developerName) {
    page.drawText(`To: ${site.developerName}`, { x: MARGIN, y, size: 10, font: fontBold, color: COLOR_TEXT })
    y -= LINE_HEIGHT
  }
  if (site?.siteName) {
    page.drawText(`Site: ${site.siteName}`, { x: MARGIN, y, size: 10, font, color: COLOR_TEXT })
    y -= LINE_HEIGHT
  }
  const siteAddress = site?.documentAddress
  if (siteAddress) {
    for (const line of wrapAddress(siteAddress)) {
      page.drawText(line, { x: MARGIN, y, size: 10, font, color: COLOR_MUTED })
      y -= LINE_HEIGHT
    }
  }
  if (site?.surveyorName) {
    page.drawText(`Surveyor: ${site.surveyorName}`, { x: MARGIN, y, size: 10, font, color: COLOR_TEXT })
    y -= LINE_HEIGHT
  }
  if (site?.documentReference) {
    page.drawText(`Site ref: ${site.documentReference}`, { x: MARGIN, y, size: 10, font, color: COLOR_MUTED })
    y -= LINE_HEIGHT
  }
  if (reference) {
    page.drawText(`Variation ref: ${reference}`, { x: MARGIN, y, size: 10, font: fontBold, color: COLOR_TEXT })
    y -= LINE_HEIGHT
  }
  if (site?.developerContact) {
    page.drawText(site.developerContact, { x: MARGIN, y, size: 9, font, color: COLOR_MUTED })
    y -= LINE_HEIGHT
  }

  return y - 6
}

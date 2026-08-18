import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { embedPdfFonts } from '@/lib/documents/pdf-fonts'
import type { CompanyBranding, SiteDocumentDetails } from '@/lib/documents/company-branding'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 42
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2

const COLOR_SLATE  = rgb(0.06, 0.09, 0.16)
const COLOR_ORANGE = rgb(0.92, 0.45, 0.13)
const COLOR_TEXT   = rgb(0.12, 0.12, 0.12)
const COLOR_MUTED  = rgb(0.45, 0.45, 0.45)
const COLOR_LINE   = rgb(0.85, 0.87, 0.90)
const COLOR_WHITE  = rgb(1, 1, 1)

export type SiteAuditPdfPhoto = {
  bytes: Buffer
  mime:  string
}

export type SiteAuditPdfItem = {
  plotNumber:  string
  description: string
  photos:      SiteAuditPdfPhoto[]
}

export type SiteAuditPdfInput = {
  company:         CompanyBranding
  siteName:        string
  siteCode:        string | null
  siteAddress:     string | null
  siteDocuments?:  SiteDocumentDetails
  auditedByName:   string
  auditedByRole:   string | null
  auditDate:       Date
  generalNotes:    string | null
  items:           SiteAuditPdfItem[]
}

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    year:    'numeric',
  })
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

async function embedPhoto(pdf: PDFDocument, photo: SiteAuditPdfPhoto): Promise<PDFImage | null> {
  try {
    const mime = photo.mime.toLowerCase()
    if (mime.includes('png')) return await pdf.embedPng(photo.bytes)
    return await pdf.embedJpg(photo.bytes)
  } catch {
    return null
  }
}

export function siteAuditPdfFilename(opts: {
  siteCode: string | null
  siteName: string
  auditDate: Date
}): string {
  const code = (opts.siteCode || opts.siteName || 'site')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  const date = opts.auditDate.toISOString().slice(0, 10)
  return `Site-Audit_${code}_${date}.pdf`
}

export async function generateSiteAuditPdf(input: SiteAuditPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const { font: regular, fontBold: bold } = await embedPdfFonts(pdf)

  const pages: PDFPage[] = []
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  pages.push(page)
  let y = PAGE_HEIGHT - MARGIN

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 36) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pages.push(page)
      y = PAGE_HEIGHT - MARGIN
      return true
    }
    return false
  }

  // ── Header band ────────────────────────────────────────────
  const headerH = 88
  page.drawRectangle({
    x: 0, y: PAGE_HEIGHT - headerH,
    width: PAGE_WIDTH, height: headerH,
    color: COLOR_SLATE,
  })
  page.drawRectangle({
    x: 0, y: PAGE_HEIGHT - headerH - 4,
    width: PAGE_WIDTH, height: 4,
    color: COLOR_ORANGE,
  })

  const logo = await embedLogo(pdf, input.company)
  let titleX = MARGIN
  if (logo) {
    const scale = Math.min(90 / logo.width, 44 / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    const pad = 8
    const logoY = PAGE_HEIGHT - headerH + 18
    page.drawRectangle({
      x: MARGIN - pad, y: logoY - pad,
      width: w + pad * 2, height: h + pad * 2,
      color: COLOR_WHITE,
    })
    page.drawImage(logo, { x: MARGIN, y: logoY, width: w, height: h })
    titleX = MARGIN + w + 18
  }

  page.drawText((input.company.companyName || 'GLYN JENKINS LTD').toUpperCase(), {
    x: titleX, y: PAGE_HEIGHT - 36,
    size: 11, font: bold, color: COLOR_WHITE,
  })
  page.drawText('Site Audit Report', {
    x: titleX, y: PAGE_HEIGHT - 54,
    size: 16, font: bold, color: COLOR_ORANGE,
  })
  page.drawText(input.siteName, {
    x: titleX, y: PAGE_HEIGHT - 72,
    size: 10, font: regular, color: COLOR_WHITE,
  })

  y = PAGE_HEIGHT - headerH - 28

  // ── Details block ──────────────────────────────────────────
  const details: [string, string][] = [
    ['Site', input.siteName],
  ]
  if (input.siteCode) details.push(['Site code', input.siteCode])
  const address = input.siteDocuments?.documentAddress || input.siteAddress
  if (address) details.push(['Address', address])
  if (input.siteDocuments?.developerName) {
    details.push(['Developer', input.siteDocuments.developerName])
  }
  details.push(['Audit date', formatDate(input.auditDate)])
  details.push([
    'Conducted by',
    input.auditedByRole
      ? `${input.auditedByName} (${input.auditedByRole})`
      : input.auditedByName,
  ])
  details.push(['Items', String(input.items.length)])

  for (const [label, value] of details) {
    ensureSpace(16)
    page.drawText(`${label}:`, {
      x: MARGIN, y, size: 9, font: bold, color: COLOR_MUTED,
    })
    const lines = wrapText(value, CONTENT_W - 110, regular, 10)
    page.drawText(lines[0] ?? '', {
      x: MARGIN + 110, y, size: 10, font: regular, color: COLOR_TEXT,
    })
    y -= 14
    for (const line of lines.slice(1)) {
      ensureSpace(14)
      page.drawText(line, {
        x: MARGIN + 110, y, size: 10, font: regular, color: COLOR_TEXT,
      })
      y -= 14
    }
  }

  y -= 8
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: COLOR_LINE,
  })
  y -= 20

  // ── Items grouped by plot ──────────────────────────────────
  const byPlot = new Map<string, SiteAuditPdfItem[]>()
  for (const item of input.items) {
    const key = item.plotNumber.trim() || 'General'
    const list = byPlot.get(key) ?? []
    list.push(item)
    byPlot.set(key, list)
  }

  let itemIndex = 0
  for (const [plot, plotItems] of byPlot) {
    ensureSpace(28)
    page.drawText(`Plot ${plot}`, {
      x: MARGIN, y, size: 13, font: bold, color: COLOR_SLATE,
    })
    y -= 18

    for (const item of plotItems) {
      itemIndex += 1
      const descLines = wrapText(
        `${itemIndex}. ${item.description}`,
        CONTENT_W,
        regular,
        10,
      )
      ensureSpace(descLines.length * 13 + 8)
      for (const line of descLines) {
        page.drawText(line, {
          x: MARGIN, y, size: 10, font: regular, color: COLOR_TEXT,
        })
        y -= 13
      }
      y -= 6

      const photos: PDFImage[] = []
      for (const p of item.photos) {
        const img = await embedPhoto(pdf, p)
        if (img) photos.push(img)
      }

      const colGap = 12
      const colW = (CONTENT_W - colGap) / 2
      const maxH = 170 // ~6 cm

      for (let i = 0; i < photos.length; i += 2) {
        const row = photos.slice(i, i + 2)
        const rowH = Math.max(
          ...row.map((img) => {
            const scale = Math.min(colW / img.width, maxH / img.height)
            return img.height * scale
          }),
          40,
        )
        ensureSpace(rowH + 12)
        row.forEach((img, col) => {
          const scale = Math.min(colW / img.width, maxH / img.height)
          const w = img.width * scale
          const h = img.height * scale
          const x = MARGIN + col * (colW + colGap)
          page.drawImage(img, {
            x,
            y: y - h,
            width: w,
            height: h,
          })
        })
        y -= rowH + 10
      }
      y -= 8
    }
    y -= 6
  }

  // ── General notes ──────────────────────────────────────────
  if (input.generalNotes?.trim()) {
    ensureSpace(40)
    page.drawText('General notes', {
      x: MARGIN, y, size: 12, font: bold, color: COLOR_SLATE,
    })
    y -= 16
    for (const line of wrapText(input.generalNotes.trim(), CONTENT_W, regular, 10)) {
      ensureSpace(13)
      page.drawText(line, {
        x: MARGIN, y, size: 10, font: regular, color: COLOR_TEXT,
      })
      y -= 13
    }
    y -= 10
  }

  // ── Sign-off ───────────────────────────────────────────────
  ensureSpace(40)
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: COLOR_LINE,
  })
  y -= 16
  const signOff = [
    `Conducted by: ${input.auditedByName}`,
    input.auditedByRole ? `Role: ${input.auditedByRole}` : null,
    `Date: ${formatDate(input.auditDate)}`,
  ].filter(Boolean).join('  ·  ')
  for (const line of wrapText(signOff, CONTENT_W, regular, 9)) {
    ensureSpace(12)
    page.drawText(line, {
      x: MARGIN, y, size: 9, font: regular, color: COLOR_MUTED,
    })
    y -= 12
  }

  // ── Footers ────────────────────────────────────────────────
  const total = pages.length
  pages.forEach((p, idx) => {
    p.drawText('Glyn Jenkins Ltd — Workforce Portal · Site Audit Report', {
      x: MARGIN, y: 22, size: 8, font: regular, color: COLOR_MUTED,
    })
    const label = `Page ${idx + 1} of ${total}`
    const w = regular.widthOfTextAtSize(label, 8)
    p.drawText(label, {
      x: PAGE_WIDTH - MARGIN - w, y: 22, size: 8, font: regular, color: COLOR_MUTED,
    })
  })

  return Buffer.from(await pdf.save())
}

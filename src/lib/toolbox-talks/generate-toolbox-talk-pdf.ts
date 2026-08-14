import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { embedPdfFonts } from '@/lib/documents/pdf-fonts'
import type { CompanyBranding, SiteDocumentDetails } from '@/lib/documents/company-branding'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 13
const BODY_SIZE   = 10

const COLOR_SLATE  = rgb(0.06, 0.09, 0.16)
const COLOR_ORANGE = rgb(0.92, 0.45, 0.13)
const COLOR_TEXT   = rgb(0.12, 0.12, 0.12)
const COLOR_MUTED  = rgb(0.45, 0.45, 0.45)
const COLOR_AMBER  = rgb(0.85, 0.47, 0.02)
const COLOR_LINE   = rgb(0.85, 0.87, 0.90)
const COLOR_WHITE  = rgb(1, 1, 1)

export type ToolboxTalkPdfAttendee = {
  name:       string
  role:       string | null
  signedAt:   Date | null
  signaturePng: Buffer | null
}

export type ToolboxTalkPdfInput = {
  company:          CompanyBranding
  siteName:         string
  siteCode:         string | null
  siteDocuments?:   SiteDocumentDetails
  title:            string
  description:      string
  conductedByName:  string
  conductedByRole:  string | null
  conductedAt:      Date
  managerSignaturePng: Buffer
  attendees:        ToolboxTalkPdfAttendee[]
  amendmentCount?:  number
  amendedAt?:       Date | null
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

function formatWhen(d: Date): string {
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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

export function toolboxTalkPdfFilename(opts: {
  siteCode: string | null
  siteName: string
  conductedAt: Date
  title: string
}): string {
  const code = (opts.siteCode || opts.siteName || 'site')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  const date = opts.conductedAt.toISOString().slice(0, 10)
  const short = opts.title
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'talk'
  return `Toolbox-Talk_${code}_${date}_${short}.pdf`
}

export async function generateToolboxTalkPdf(input: ToolboxTalkPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const { font, fontBold } = await embedPdfFonts(pdf)
  const pages: PDFPage[] = []
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  pages.push(page)
  let y = PAGE_HEIGHT - MARGIN
  const maxWidth = PAGE_WIDTH - 2 * MARGIN

  const ensureSpace = (h: number) => {
    if (y - h < MARGIN + 24) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pages.push(page)
      y = PAGE_HEIGHT - MARGIN
    }
  }

  const drawText = (text: string, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; x?: number }) => {
    const size = opts?.size ?? BODY_SIZE
    page.drawText(text, {
      x:     opts?.x ?? MARGIN,
      y,
      size,
      font:  opts?.bold ? fontBold : font,
      color: opts?.color ?? COLOR_TEXT,
    })
    y -= size + 4
  }

  // ── Dark header band ──────────────────────────────────────────
  const headerH = 78
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - headerH,
    width: PAGE_WIDTH,
    height: headerH,
    color: COLOR_SLATE,
  })

  const logo = await embedLogo(pdf, input.company)
  if (logo) {
    const scale = Math.min(90 / logo.width, 44 / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    const pad = 8
    const logoY = PAGE_HEIGHT - headerH + 16
    // White plate behind the logo so it never clashes with the slate band
    page.drawRectangle({
      x: MARGIN - pad,
      y: logoY - pad,
      width:  w + pad * 2,
      height: h + pad * 2,
      color: COLOR_WHITE,
    })
    page.drawImage(logo, {
      x: MARGIN,
      y: logoY,
      width: w,
      height: h,
    })
  }

  page.drawText(input.company.companyName || 'GLYN JENKINS LTD', {
    x: logo ? MARGIN + 100 : MARGIN,
    y: PAGE_HEIGHT - 32,
    size: 14,
    font: fontBold,
    color: COLOR_ORANGE,
  })
  page.drawText('Toolbox Talk Record', {
    x: logo ? MARGIN + 100 : MARGIN,
    y: PAGE_HEIGHT - 50,
    size: 11,
    font: fontBold,
    color: COLOR_WHITE,
  })
  page.drawText(input.title.slice(0, 80), {
    x: logo ? MARGIN + 100 : MARGIN,
    y: PAGE_HEIGHT - 66,
    size: 9,
    font,
    color: rgb(0.75, 0.78, 0.82),
  })

  y = PAGE_HEIGHT - headerH - 18

  // ── Details ───────────────────────────────────────────────────
  drawText('Talk details', { bold: true, size: 12 })
  y -= 2
  const details: [string, string][] = [
    ['Site', input.siteName],
    ...(input.siteCode ? [['Site code', input.siteCode] as [string, string]] : []),
    ...(input.siteDocuments?.documentAddress
      ? [['Address', input.siteDocuments.documentAddress.replace(/\n+/g, ', ')] as [string, string]]
      : []),
    ...(input.siteDocuments?.developerName
      ? [['Developer / client', input.siteDocuments.developerName] as [string, string]]
      : []),
    ['Date & time', formatWhen(input.conductedAt)],
    [
      'Conducted by',
      input.conductedByRole
        ? `${input.conductedByName} (${input.conductedByRole.replace(/_/g, ' ')})`
        : input.conductedByName,
    ],
  ]
  for (const [label, value] of details) {
    for (const line of wrapText(`${label}: ${value}`, maxWidth, font, BODY_SIZE)) {
      ensureSpace(LINE_HEIGHT)
      drawText(line, { size: BODY_SIZE, color: COLOR_TEXT })
    }
  }

  y -= 8
  ensureSpace(40)
  drawText('Subject of talk', { bold: true, size: 12 })
  y -= 2
  for (const line of wrapText(input.description, maxWidth, font, BODY_SIZE)) {
    ensureSpace(LINE_HEIGHT)
    drawText(line)
  }

  // ── Attendance register ───────────────────────────────────────
  y -= 10
  ensureSpace(50)
  drawText('Attendance register', { bold: true, size: 12 })
  y -= 4

  const colNum  = MARGIN
  const colName = MARGIN + 28
  const colRole = MARGIN + 200
  const colSig  = MARGIN + 300
  const colTime = PAGE_WIDTH - MARGIN - 70

  const drawTableHeader = () => {
    ensureSpace(28)
    page.drawText('#', { x: colNum, y, size: 8, font: fontBold, color: COLOR_MUTED })
    page.drawText('Name', { x: colName, y, size: 8, font: fontBold, color: COLOR_MUTED })
    page.drawText('Role', { x: colRole, y, size: 8, font: fontBold, color: COLOR_MUTED })
    page.drawText('Signature', { x: colSig, y, size: 8, font: fontBold, color: COLOR_MUTED })
    page.drawText('Time', { x: colTime, y, size: 8, font: fontBold, color: COLOR_MUTED })
    y -= 6
    page.drawLine({
      start: { x: MARGIN, y },
      end:   { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.8,
      color: COLOR_LINE,
    })
    y -= 14
  }

  drawTableHeader()

  for (let i = 0; i < input.attendees.length; i++) {
    const a = input.attendees[i]
    const rowH = a.signaturePng ? 42 : 22
    ensureSpace(rowH + 8)
    if (y < MARGIN + 40) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pages.push(page)
      y = PAGE_HEIGHT - MARGIN
      drawTableHeader()
    }

    page.drawText(String(i + 1), { x: colNum, y, size: 9, font, color: COLOR_TEXT })
    page.drawText(a.name.slice(0, 28), { x: colName, y, size: 9, font: fontBold, color: COLOR_TEXT })
    page.drawText((a.role ?? '—').replace(/_/g, ' ').slice(0, 16), {
      x: colRole, y, size: 8, font, color: COLOR_MUTED,
    })

    if (a.signaturePng) {
      try {
        const img = await pdf.embedPng(a.signaturePng)
        const sigW = 90
        const sigH = Math.min(34, (img.height / img.width) * sigW)
        page.drawImage(img, { x: colSig, y: y - sigH + 10, width: sigW, height: sigH })
      } catch {
        page.drawText('Signed', { x: colSig, y, size: 8, font, color: COLOR_MUTED })
      }
      if (a.signedAt) {
        page.drawText(formatTime(a.signedAt), { x: colTime, y, size: 8, font, color: COLOR_MUTED })
      }
      y -= rowH
    } else {
      page.drawText('Did not sign', { x: colSig, y, size: 9, font: fontBold, color: COLOR_AMBER })
      page.drawText('—', { x: colTime, y, size: 8, font, color: COLOR_MUTED })
      y -= rowH
    }

    page.drawLine({
      start: { x: MARGIN, y: y + 6 },
      end:   { x: PAGE_WIDTH - MARGIN, y: y + 6 },
      thickness: 0.4,
      color: COLOR_LINE,
    })
  }

  // ── Manager sign-off ──────────────────────────────────────────
  y -= 16
  ensureSpace(120)
  drawText('Conducted and verified by', { bold: true, size: 12 })
  y -= 4

  try {
    const mgrImg = await pdf.embedPng(input.managerSignaturePng)
    const sigW = 160
    const sigH = Math.min(50, (mgrImg.height / mgrImg.width) * sigW)
    ensureSpace(sigH + 50)
    page.drawImage(mgrImg, { x: MARGIN, y: y - sigH, width: sigW, height: sigH })
    y -= sigH + 10
  } catch {
    drawText('(signature on file)', { size: 9, color: COLOR_MUTED })
  }

  drawText(input.conductedByName, { bold: true, size: 11 })
  if (input.conductedByRole) {
    drawText(input.conductedByRole.replace(/_/g, ' '), { size: 9, color: COLOR_MUTED })
  }
  drawText(formatWhen(input.conductedAt), { size: 9, color: COLOR_MUTED })

  if ((input.amendmentCount ?? 0) > 0 && input.amendedAt) {
    const rev = (input.amendmentCount ?? 0) + 1
    drawText(
      `Amended on ${formatWhen(input.amendedAt)} — revision ${rev}`,
      { size: 9, color: COLOR_MUTED },
    )
  }

  // ── Footers ───────────────────────────────────────────────────
  const total = pages.length
  pages.forEach((p, idx) => {
    p.drawText(
      `Glyn Jenkins Ltd — Workforce Portal · Toolbox Talk Record`,
      { x: MARGIN, y: 28, size: 8, font, color: COLOR_MUTED },
    )
    const pageLabel = `Page ${idx + 1} of ${total}`
    const w = font.widthOfTextAtSize(pageLabel, 8)
    p.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - w,
      y: 28,
      size: 8,
      font,
      color: COLOR_MUTED,
    })
  })

  return Buffer.from(await pdf.save())
}

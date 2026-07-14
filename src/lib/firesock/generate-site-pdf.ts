import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { drawPdfLetterhead } from '@/lib/documents/pdf-letterhead'
import type { CompanyBranding, SiteDocumentDetails } from '@/lib/documents/company-branding'
import { MIN_FIRESOCK_PHOTOS } from './constants'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 14
const BODY_SIZE   = 10
const TITLE_SIZE  = 14
const PHOTO_COLS  = 2
const PHOTO_GAP   = 10
const PHOTOS_PER_PAGE = 4

export type FiresockPdfPhoto = {
  label:  string
  buffer: Buffer
  mime:   string
}

export type FiresockPlotPdfSection = {
  plotNumber: string
  details:    { label: string; value: string }[]
  photos:     FiresockPdfPhoto[]
  evidenceMet: boolean
}

export type FiresockSitePdfInput = {
  siteName:       string
  siteDocuments?: SiteDocumentDetails
  company:        CompanyBranding
  generatedAt:    Date
  plots:          FiresockPlotPdfSection[]
}

function wrapText(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontSize: number,
): string[] {
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

function isJpegMime(mime: string): boolean {
  return mime.includes('jpeg') || mime.includes('jpg')
}

async function embedPhotoImage(pdf: PDFDocument, buffer: Buffer, mime: string) {
  return isJpegMime(mime) ? pdf.embedJpg(buffer) : pdf.embedPng(buffer)
}

export async function generateFiresockSitePdf(input: FiresockSitePdfInput): Promise<Buffer> {
  const pdf      = await PDFDocument.create()
  const font     = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page       = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y          = PAGE_HEIGHT - MARGIN
  const maxWidth = PAGE_WIDTH - 2 * MARGIN

  const drawLines = (lines: string[], opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) => {
    const size = opts?.size ?? BODY_SIZE
    const f    = opts?.bold ? fontBold : font
    const color = opts?.color ?? rgb(0.12, 0.12, 0.12)
    for (const line of lines) {
      if (y - LINE_HEIGHT < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
      }
      page.drawText(line, { x: MARGIN, y, size, font: f, color })
      y -= LINE_HEIGHT
    }
  }

  y = await drawPdfLetterhead(pdf, page, font, fontBold, y, {
    documentTitle: 'Roof firesock evidence',
    company:       input.company,
    site: {
      documentAddress:   input.siteDocuments?.documentAddress ?? null,
      developerName:     input.siteDocuments?.developerName ?? null,
      developerContact:  input.siteDocuments?.developerContact ?? null,
      surveyorName:      input.siteDocuments?.surveyorName ?? null,
      documentReference: input.siteDocuments?.documentReference ?? null,
      siteName:          input.siteName,
    },
  })
  y -= 8
  const required = input.plots.filter((p) => p.photos.length > 0 || !p.evidenceMet)
  const complete = required.filter((p) => p.evidenceMet).length
  drawLines([
    `Generated: ${input.generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    `Plots with evidence: ${complete} of ${required.length} complete (minimum ${MIN_FIRESOCK_PHOTOS} photos per plot)`,
  ], { color: rgb(0.4, 0.4, 0.4) })
  y -= 10

  for (const plot of input.plots) {
    if (plot.photos.length === 0 && plot.evidenceMet) continue

    if (y < MARGIN + 120) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    page.drawLine({
      start: { x: MARGIN, y: y + 6 },
      end:   { x: PAGE_WIDTH - MARGIN, y: y + 6 },
      thickness: 0.5,
      color: rgb(0.82, 0.85, 0.88),
    })
    y -= 16

    drawLines([`Plot ${plot.plotNumber}`], { bold: true, size: TITLE_SIZE })
    if (plot.details.length) {
      drawLines([plot.details.map((d) => `${d.label}: ${d.value}`).join(' · ')], { color: rgb(0.35, 0.35, 0.35) })
    }
    drawLines([
      plot.evidenceMet
        ? `${plot.photos.length} photos uploaded`
        : `Incomplete — ${plot.photos.length} of ${MIN_FIRESOCK_PHOTOS} photos`,
    ], { color: plot.evidenceMet ? rgb(0.1, 0.55, 0.3) : rgb(0.75, 0.35, 0.1) })
    y -= 6

    if (plot.photos.length === 0) continue

    const colWidth = (maxWidth - PHOTO_GAP) / PHOTO_COLS
    let photoIdx = 0

    while (photoIdx < plot.photos.length) {
      const batch = plot.photos.slice(photoIdx, photoIdx + PHOTOS_PER_PAGE)
      const rows  = Math.ceil(batch.length / PHOTO_COLS)
      const cellH = 220
      const blockH = rows * cellH + (rows - 1) * PHOTO_GAP + 20

      if (y - blockH < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
      }

      for (let i = 0; i < batch.length; i++) {
        const photo = batch[i]!
        const col   = i % PHOTO_COLS
        const row   = Math.floor(i / PHOTO_COLS)
        const x     = MARGIN + col * (colWidth + PHOTO_GAP)
        const topY  = y - row * (cellH + PHOTO_GAP)

        const img   = await embedPhotoImage(pdf, photo.buffer, photo.mime)
        const scale = Math.min(colWidth / img.width, (cellH - 16) / img.height)
        const w     = img.width * scale
        const h     = img.height * scale

        page.drawText(photo.label, {
          x,
          y: topY - 10,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        })

        page.drawImage(img, {
          x: x + (colWidth - w) / 2,
          y: topY - 16 - h,
          width:  w,
          height: h,
        })
      }

      y -= blockH + 12
      photoIdx += PHOTOS_PER_PAGE
    }
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

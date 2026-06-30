import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { drawPdfLetterhead } from '@/lib/documents/pdf-letterhead'
import { MATERIAL_UPLIFT_PERCENT } from '@/lib/variations/rates'
import type { DeveloperVariationPdfData } from '@/lib/variations/load-developer-variation-pdf'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 14

function fmtMoney(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.12, 0.12, 0.12)
) {
  page.drawText(text, { x, y, size, font, color })
}

export async function generateDeveloperVariationPdf(
  data: DeveloperVariationPdfData
): Promise<Buffer> {
  const pdf      = await PDFDocument.create()
  const font     = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  let y = PAGE_HEIGHT - MARGIN

  y = await drawPdfLetterhead(pdf, page, font, fontBold, y, {
    documentTitle: 'Variation claim — for developer approval',
    company:         data.company,
    site: {
      ...data.siteDocuments,
      siteName: data.siteName,
      siteCode: data.siteCode,
    },
    reference: data.reference,
  })

  const row = (text: string, opts?: { bold?: boolean; size?: number; x?: number }) => {
    drawText(page, text, opts?.x ?? MARGIN, y, opts?.bold ? fontBold : font, opts?.size ?? 10)
    y -= LINE_HEIGHT
  }

  row(`Prepared: ${fmtDate(data.preparedAt)}`)
  if (data.submittedAt) {
    row(`Submitted: ${fmtDate(data.submittedAt)}`)
  }
  y -= 6

  row('Description of works', { bold: true, size: 11 })
  const descWords = data.description.split(/\s+/)
  let descLine = ''
  const maxWidth = PAGE_WIDTH - 2 * MARGIN
  for (const word of descWords) {
    const test = descLine ? `${descLine} ${word}` : word
    if (font.widthOfTextAtSize(test, 10) > maxWidth && descLine) {
      row(descLine)
      descLine = word
    } else {
      descLine = test
    }
  }
  if (descLine) row(descLine)
  y -= 10

  const colTrade = MARGIN
  const colHours = 280
  const colRate  = 360
  const colTotal = 460

  row('Trade', { bold: true })
  drawText(page, 'Hours', colHours, y + LINE_HEIGHT, fontBold, 10)
  drawText(page, 'Rate', colRate, y + LINE_HEIGHT, fontBold, 10)
  drawText(page, 'Total', colTotal, y + LINE_HEIGHT, fontBold, 10)
  y -= 4

  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  })
  y -= LINE_HEIGHT

  for (const line of data.lines) {
    drawText(page, line.roleLabel, colTrade, y, font, 10)
    drawText(page, String(line.hours), colHours, y, font, 10)
    drawText(page, `${fmtMoney(line.rate)}/hr`, colRate, y, font, 10)
    drawText(page, fmtMoney(line.total), colTotal, y, font, 10)
    y -= LINE_HEIGHT
  }

  y -= 8
  page.drawLine({
    start: { x: MARGIN, y: y + 6 },
    end:   { x: PAGE_WIDTH - MARGIN, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  })

  const totalRow = (label: string, amount: string, bold = false) => {
    drawText(page, label, colRate - 40, y, bold ? fontBold : font, bold ? 12 : 10)
    drawText(page, amount, colTotal, y, bold ? fontBold : font, bold ? 12 : 10)
    y -= LINE_HEIGHT
  }

  totalRow('Labour subtotal', fmtMoney(data.workersSubtotal))
  if (data.materialUpliftEnabled) {
    totalRow(`Material uplift (${MATERIAL_UPLIFT_PERCENT}%)`, fmtMoney(data.materialUpliftAmount))
  }
  y -= 4
  totalRow('Total due', fmtMoney(data.developerTotal), true)

  if (data.siteAgent) {
    y -= 20
    const sigWidth = 180
    const pngImage = await pdf.embedPng(data.siteAgent.signaturePng)
    const sigHeight = (pngImage.height / pngImage.width) * sigWidth
    const blockH = LINE_HEIGHT * 3 + 12 + sigHeight + 16

    if (y - blockH < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    drawText(page, 'Site agent sign-off', MARGIN, y, fontBold, 11)
    y -= LINE_HEIGHT + 4
    drawText(page, `Signed by: ${data.siteAgent.name}`, MARGIN, y, font, 10)
    y -= LINE_HEIGHT
    drawText(
      page,
      `Signed at: ${data.siteAgent.signedAt.toLocaleString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })}`,
      MARGIN,
      y,
      font,
      10,
      rgb(0.45, 0.45, 0.45)
    )
    y -= 12
    page.drawImage(pngImage, { x: MARGIN, y: y - sigHeight, width: sigWidth, height: sigHeight })
    y -= sigHeight + 16
  }

  y -= 8
  drawText(
    page,
    'This document shows trade roles and developer rates only. Operative names and internal foreman charges are not included.',
    MARGIN,
    y,
    font,
    9,
    rgb(0.45, 0.45, 0.45)
  )

  return Buffer.from(await pdf.save())
}

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { embedPdfFonts } from '@/lib/documents/pdf-fonts'
import { APPRENTICE_AGREEMENT_LINES } from './apprentice-agreement'

const PAGE_WIDTH  = 595.28  // A4
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 14
const BODY_SIZE   = 10
const TITLE_SIZE  = 14
const HEADING_SIZE = 11

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

type PdfWriter = {
  drawLines: (lines: string[], opts?: { bold?: boolean; size?: number }) => void
  ensureSpace: (height: number) => void
  getY: () => number
  setY: (y: number) => void
}

function createWriter(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
): PdfWriter {
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  const drawLines = (lines: string[], opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? BODY_SIZE
    const f    = opts?.bold ? fontBold : font
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT)
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: f,
        color: rgb(0.12, 0.12, 0.12),
      })
      y -= LINE_HEIGHT
    }
  }

  return {
    drawLines,
    ensureSpace,
    getY: () => y,
    setY: (newY: number) => { y = newY },
  }
}

export async function generateApprenticePdf(params: {
  firstName:    string
  surname:      string
  email:        string
  signedAt:     Date
  signaturePng: Buffer
}): Promise<Buffer> {
  const pdf      = await PDFDocument.create()
  const { font, fontBold } = await embedPdfFonts(pdf)
  const writer   = createWriter(pdf, font, fontBold)
  const maxWidth = PAGE_WIDTH - 2 * MARGIN

  writer.drawLines(['APPRENTICESHIP AGREEMENT — GLYN JENKINS LTD'], { bold: true, size: TITLE_SIZE })
  writer.setY(writer.getY() - 6)
  writer.drawLines([
    `Apprentice: ${params.firstName} ${params.surname}`,
    `Email: ${params.email}`,
  ])
  writer.setY(writer.getY() - 10)

  for (const block of APPRENTICE_AGREEMENT_LINES) {
    if (block === '') {
      writer.setY(writer.getY() - 6)
      continue
    }
    const isHeading = block.startsWith('## ')
    const text      = isHeading ? block.slice(3) : block
    const wrapped   = wrapText(text, maxWidth, isHeading ? fontBold : font, isHeading ? HEADING_SIZE : BODY_SIZE)
    writer.drawLines(wrapped, { bold: isHeading, size: isHeading ? HEADING_SIZE : BODY_SIZE })
    if (!isHeading) writer.setY(writer.getY() - 4)
  }

  writer.setY(writer.getY() - 16)
  writer.ensureSpace(160)
  writer.drawLines(['SIGNATURE'], { bold: true, size: HEADING_SIZE })
  writer.setY(writer.getY() - 4)

  const signedDateStr = params.signedAt.toLocaleString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  })

  writer.drawLines([
    `Signed by: ${params.firstName} ${params.surname}`,
    `Date signed: ${signedDateStr}`,
    'Signed electronically via Glyn Jenkins LTD Workforce Portal.',
  ])
  writer.setY(writer.getY() - 12)

  const pngImage  = await pdf.embedPng(params.signaturePng)
  const sigWidth  = 200
  const sigHeight = (pngImage.height / pngImage.width) * sigWidth
  writer.ensureSpace(sigHeight + 20)

  const pages     = pdf.getPages()
  const lastPage  = pages[pages.length - 1]
  const sigY      = writer.getY() - sigHeight
  lastPage.drawImage(pngImage, {
    x:      MARGIN,
    y:      sigY,
    width:  sigWidth,
    height: sigHeight,
  })

  lastPage.drawText('Apprentice signature', {
    x:     MARGIN,
    y:     sigY - 14,
    size:  9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })

  return Buffer.from(await pdf.save())
}

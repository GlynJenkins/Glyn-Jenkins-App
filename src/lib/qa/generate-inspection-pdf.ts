import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qaStageLabel } from './stages'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 14
const BODY_SIZE   = 10
const TITLE_SIZE  = 14

function wrapText(text: string, maxWidth: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>, fontSize: number): string[] {
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

export type QaInspectionPdfInput = {
  siteName:     string
  plotNumber:   string
  stage:        string
  inspectorName: string
  inspectionDate: string
  observations: string
  result:       string
  signedAt:     Date
  signaturePng: Buffer
  plotDetails?: { label: string; value: string }[]
  firesockNa?:   boolean
  firesockPhoto?: Buffer
  firesockMime?: string
}

export async function generateQaInspectionPdf(input: QaInspectionPdfInput): Promise<Buffer> {
  const pdf      = await PDFDocument.create()
  const font     = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page       = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y          = PAGE_HEIGHT - MARGIN
  const maxWidth = PAGE_WIDTH - 2 * MARGIN

  const drawLines = (lines: string[], opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? BODY_SIZE
    const f    = opts?.bold ? fontBold : font
    for (const line of lines) {
      if (y - LINE_HEIGHT < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
      }
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0.12, 0.12, 0.12) })
      y -= LINE_HEIGHT
    }
  }

  drawLines(['QUALITY INSPECTION — GLYN JENKINS LTD'], { bold: true, size: TITLE_SIZE })
  y -= 6
  drawLines([
    `Site: ${input.siteName}`,
    `Plot: ${input.plotNumber}`,
    `Stage: ${qaStageLabel(input.stage)}`,
    `Inspector: ${input.inspectorName}`,
    `Inspection date: ${input.inspectionDate}`,
    `Result: ${input.result}`,
  ])
  y -= 10

  if (input.plotDetails?.length) {
    drawLines(['Plot details'], { bold: true, size: 12 })
    for (const d of input.plotDetails) {
      const wrapped = wrapText(`${d.label}: ${d.value}`, maxWidth, font, BODY_SIZE)
      drawLines(wrapped)
    }
    y -= 8
  }

  drawLines(['Observations / notes'], { bold: true, size: 12 })
  y -= 4
  const noteLines = wrapText(input.observations || '—', maxWidth, font, BODY_SIZE)
  drawLines(noteLines)
  y -= 16

  if (input.firesockNa || input.firesockPhoto) {
    drawLines(['Firesock'], { bold: true, size: 12 })
    y -= 4
    if (input.firesockNa) {
      drawLines(['Status: N/A — not required for this plot'])
    } else if (input.firesockPhoto) {
      drawLines(['Status: Photo attached below'])
      y -= 8
      const isJpeg = input.firesockMime?.includes('jpeg') || input.firesockMime?.includes('jpg')
      const photo = isJpeg
        ? await pdf.embedJpg(input.firesockPhoto)
        : await pdf.embedPng(input.firesockPhoto)
      const photoWidth = maxWidth
      const photoHeight = (photo.height / photo.width) * photoWidth
      if (y - photoHeight < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
      }
      page.drawImage(photo, {
        x: MARGIN,
        y: y - photoHeight,
        width: photoWidth,
        height: photoHeight,
      })
      y -= photoHeight + 12
    }
    y -= 8
  }

  drawLines(['SIGNATURE'], { bold: true, size: 12 })
  y -= 4
  drawLines([
    `Signed by: ${input.inspectorName}`,
    `Signed at: ${input.signedAt.toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })}`,
  ])
  y -= 12

  const pngImage  = await pdf.embedPng(input.signaturePng)
  const sigWidth  = 200
  const sigHeight = (pngImage.height / pngImage.width) * sigWidth
  if (y - sigHeight < MARGIN) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }
  page.drawImage(pngImage, { x: MARGIN, y: y - sigHeight, width: sigWidth, height: sigHeight })
  page.drawText('Inspector signature', {
    x: MARGIN, y: y - sigHeight - 14, size: 9, font, color: rgb(0.4, 0.4, 0.4),
  })

  return Buffer.from(await pdf.save())
}

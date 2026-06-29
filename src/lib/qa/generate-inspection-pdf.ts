import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qaStageLabel } from './stages'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 50
const LINE_HEIGHT = 14
const BODY_SIZE   = 10
const TITLE_SIZE  = 14
/** 2×2 photo grid — four photos per page when printing. */
const PHOTOS_PER_PAGE = 4
const PHOTO_COLS      = 2
const PHOTO_GAP       = 10
const PHOTO_LABEL_SIZE = 9
const PHOTO_CELL_H    = 300

export type QaPdfPhoto = {
  label:  string
  buffer: Buffer
  mime:   string
}

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

function isJpegMime(mime: string): boolean {
  return mime.includes('jpeg') || mime.includes('jpg')
}

async function embedPhotoImage(pdf: PDFDocument, buffer: Buffer, mime: string) {
  return isJpegMime(mime) ? pdf.embedJpg(buffer) : pdf.embedPng(buffer)
}

export type QaInspectionPdfInput = {
  siteName:       string
  plotNumber:     string
  stage:          string
  inspectorName:  string
  inspectionDate: string
  observations:   string
  result:         string
  signedAt:       Date
  signaturePng:   Buffer
  plotDetails?:   { label: string; value: string }[]
  firesockNa?:    boolean
  photos?:        QaPdfPhoto[]
  checklist?:     { label: string; checked: boolean }[]
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

  const drawPhotoGrid = async (photos: QaPdfPhoto[]) => {
    if (!photos.length) return

    const cellW = (maxWidth - PHOTO_GAP) / PHOTO_COLS
    const rowH  = PHOTO_LABEL_SIZE + 4 + PHOTO_CELL_H + PHOTO_GAP

    for (let i = 0; i < photos.length; i += PHOTOS_PER_PAGE) {
      const batch = photos.slice(i, i + PHOTOS_PER_PAGE)
      const rows  = Math.ceil(batch.length / PHOTO_COLS)
      const gridH = rows * rowH

      if (y - gridH < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
        if (i > 0) {
          drawLines(['PHOTOS (continued)'], { bold: true, size: 12 })
          y -= 8
        }
      }

      const gridTop = y

      for (let j = 0; j < batch.length; j++) {
        const photo = batch[j]!
        const col   = j % PHOTO_COLS
        const row   = Math.floor(j / PHOTO_COLS)
        const cellX = MARGIN + col * (cellW + PHOTO_GAP)
        const cellTop = gridTop - row * rowH

        page.drawText(photo.label, {
          x: cellX,
          y: cellTop - PHOTO_LABEL_SIZE,
          size: PHOTO_LABEL_SIZE,
          font: fontBold,
          color: rgb(0.12, 0.12, 0.12),
        })

        const image = await embedPhotoImage(pdf, photo.buffer, photo.mime)
        const scale = Math.min(cellW / image.width, PHOTO_CELL_H / image.height)
        const drawW = image.width * scale
        const drawH = image.height * scale
        const imgX  = cellX + (cellW - drawW) / 2
        const imgY  = cellTop - PHOTO_LABEL_SIZE - 4 - drawH

        page.drawImage(image, {
          x: imgX,
          y: imgY,
          width: drawW,
          height: drawH,
        })
      }

      y = gridTop - gridH - 8
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

  if (input.checklist?.length) {
    drawLines(['Inspection checklist'], { bold: true, size: 12 })
    y -= 4
    for (const item of input.checklist) {
      const mark = item.checked ? '[X]' : '[ ]'
      const wrapped = wrapText(`${mark} ${item.label}`, maxWidth, font, BODY_SIZE)
      drawLines(wrapped)
    }
    y -= 8
  }

  drawLines(['Observations / notes'], { bold: true, size: 12 })
  y -= 4
  const noteLines = wrapText(input.observations || '—', maxWidth, font, BODY_SIZE)
  drawLines(noteLines)
  y -= 16

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
  y -= sigHeight + 32

  const hasPhotos = (input.photos?.length ?? 0) > 0
  if (input.firesockNa || hasPhotos) {
    const firstBatchRows = Math.ceil(Math.min(input.photos?.length ?? 0, PHOTOS_PER_PAGE) / PHOTO_COLS)
    const firstGridH = firstBatchRows * (PHOTO_LABEL_SIZE + 4 + PHOTO_CELL_H + PHOTO_GAP)
    const headerH = 40 + (input.firesockNa ? LINE_HEIGHT + 8 : 0)

    if (y - headerH - firstGridH < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    drawLines(['PHOTOS'], { bold: true, size: 12 })
    y -= 8

    if (input.firesockNa) {
      drawLines(['Firesock: N/A — not required for this plot'])
      y -= 8
    }

    await drawPhotoGrid(input.photos ?? [])
  }

  return Buffer.from(await pdf.save())
}

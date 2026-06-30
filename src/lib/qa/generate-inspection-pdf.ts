import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { drawPdfLetterhead } from '@/lib/documents/pdf-letterhead'
import type { CompanyBranding, SiteDocumentDetails } from '@/lib/documents/company-branding'
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

const CHECKLIST_OPTION_H   = 20
const CHECKLIST_OPTION_GAP = 6
const CHECKLIST_ITEM_GAP   = 14
const CHECKLIST_OPTION_SIZE = 9

const COLOR_YES     = rgb(0.086, 0.396, 0.204) // green-600
const COLOR_NO      = rgb(0.863, 0.149, 0.149) // red-600
const COLOR_NA      = rgb(0.176, 0.216, 0.282) // slate-700
const COLOR_WHITE   = rgb(1, 1, 1)
const COLOR_MUTED   = rgb(0.45, 0.45, 0.45)
const COLOR_BORDER  = rgb(0.75, 0.78, 0.82)

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
  siteDocuments?: SiteDocumentDetails
  company?:       CompanyBranding
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
  checklist?:     { label: string; answer: 'yes' | 'no' | 'na' }[]
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

  const drawChecklistItem = (item: { label: string; answer: 'yes' | 'no' | 'na' }) => {
    const questionLines = wrapText(item.label, maxWidth, font, BODY_SIZE)
    const blockH =
      questionLines.length * LINE_HEIGHT + 4 + CHECKLIST_OPTION_H + CHECKLIST_ITEM_GAP

    if (y - blockH < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    for (const line of questionLines) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: rgb(0.12, 0.12, 0.12),
      })
      y -= LINE_HEIGHT
    }

    y -= 4
    const optionY = y - CHECKLIST_OPTION_H
    const optionW = (maxWidth - 2 * CHECKLIST_OPTION_GAP) / 3
    const options: { key: 'yes' | 'no' | 'na'; label: string; fill: ReturnType<typeof rgb> }[] = [
      { key: 'yes', label: 'Yes', fill: COLOR_YES },
      { key: 'no',  label: 'No',  fill: COLOR_NO },
      { key: 'na',  label: 'N/A', fill: COLOR_NA },
    ]

    options.forEach((opt, index) => {
      const x = MARGIN + index * (optionW + CHECKLIST_OPTION_GAP)
      const selected = item.answer === opt.key
      const textW = fontBold.widthOfTextAtSize(opt.label, CHECKLIST_OPTION_SIZE)
      const textX = x + (optionW - textW) / 2
      const textY = optionY + (CHECKLIST_OPTION_H - CHECKLIST_OPTION_SIZE) / 2 + 1

      if (selected) {
        page.drawRectangle({
          x,
          y: optionY,
          width: optionW,
          height: CHECKLIST_OPTION_H,
          color: opt.fill,
          borderWidth: 0,
        })
        page.drawText(opt.label, {
          x: textX,
          y: textY,
          size: CHECKLIST_OPTION_SIZE,
          font: fontBold,
          color: COLOR_WHITE,
        })
      } else {
        page.drawRectangle({
          x,
          y: optionY,
          width: optionW,
          height: CHECKLIST_OPTION_H,
          borderColor: COLOR_BORDER,
          borderWidth: 1,
        })
        page.drawText(opt.label, {
          x: textX,
          y: textY,
          size: CHECKLIST_OPTION_SIZE,
          font: fontBold,
          color: COLOR_MUTED,
        })
      }
    })

    y = optionY - CHECKLIST_ITEM_GAP
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

  if (input.company) {
    y = await drawPdfLetterhead(pdf, page, font, fontBold, y, {
      documentTitle: 'Quality inspection report',
      company:       input.company,
      site: {
        documentAddress:   input.siteDocuments?.documentAddress ?? null,
        developerName:     input.siteDocuments?.developerName ?? null,
        developerContact:  input.siteDocuments?.developerContact ?? null,
        surveyorName:      input.siteDocuments?.surveyorName ?? null,
        documentReference: input.siteDocuments?.documentReference ?? null,
        siteName: input.siteName,
      },
    })
    y -= 4
  } else {
    drawLines(['QUALITY INSPECTION — GLYN JENKINS LTD'], { bold: true, size: TITLE_SIZE })
    y -= 6
    drawLines([`Site: ${input.siteName}`])
  }

  drawLines([
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
      drawChecklistItem(item)
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

import { PDFDocument, rgb } from 'pdf-lib'
import { embedPdfFonts } from '@/lib/documents/pdf-fonts'
import { drawPdfLetterhead } from '@/lib/documents/pdf-letterhead'
import { loadCompanyBranding } from '@/lib/documents/company-branding'
import {
  formatCscsExpiry,
  cscsStatusLabel,
  hsStatusLabel,
  type TrainingMatrixRow,
} from '@/lib/training/load-training-matrix'

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN      = 36
const ROW_H       = 16
const FONT_SIZE   = 8
const HEADER_SIZE = 8

const COLOR_TEXT   = rgb(0.12, 0.12, 0.12)
const COLOR_MUTED  = rgb(0.4, 0.4, 0.4)
const COLOR_LINE   = rgb(0.85, 0.85, 0.85)
const COLOR_HEADER = rgb(0.95, 0.95, 0.95)

type Col = { key: keyof typeof COL_KEYS; label: string; width: number; get: (r: TrainingMatrixRow) => string }

const COL_KEYS = {
  name: true,
  trade: true,
  qualification: true,
  cscsNumber: true,
  cscsExpiry: true,
  cscsStatus: true,
  hs: true,
} as const

const COLS: Col[] = [
  { key: 'name',          label: 'Name',          width: 90,  get: (r) => r.name },
  { key: 'trade',         label: 'Trade',         width: 70,  get: (r) => r.trade },
  { key: 'qualification', label: 'Qualification', width: 85,  get: (r) => r.qualification },
  { key: 'cscsNumber',    label: 'CSCS No.',      width: 70,  get: (r) => r.cscsNumber ?? '—' },
  { key: 'cscsExpiry',    label: 'CSCS Expiry',   width: 60,  get: (r) => formatCscsExpiry(r.cscsExpiryDate) },
  { key: 'cscsStatus',    label: 'CSCS Status',   width: 60,  get: (r) => cscsStatusLabel(r.cscsStatus) },
  { key: 'hs',            label: 'H&S',           width: 58,  get: (r) => hsStatusLabel(r.hsStatus) },
]

function truncate(font: { widthOfTextAtSize: (t: string, s: number) => number }, text: string, maxWidth: number, size: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

export async function generateTrainingMatrixPdf(rows: TrainingMatrixRow[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const { font, fontBold } = await embedPdfFonts(pdf)
  const company = await loadCompanyBranding()

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  y = await drawPdfLetterhead(pdf, page, font, fontBold, y, {
    documentTitle: 'Training Matrix',
    company,
  })

  y -= 8
  page.drawText(`Active workers: ${rows.length}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: COLOR_MUTED,
  })
  y -= 14

  const drawHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - ROW_H + 4,
      width: PAGE_WIDTH - MARGIN * 2,
      height: ROW_H,
      color: COLOR_HEADER,
    })
    let x = MARGIN + 2
    for (const col of COLS) {
      page.drawText(col.label, {
        x,
        y: y - 7,
        size: HEADER_SIZE,
        font: fontBold,
        color: COLOR_TEXT,
      })
      x += col.width
    }
    y -= ROW_H
  }

  drawHeader()

  for (const row of rows) {
    if (y < MARGIN + ROW_H + 20) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      drawHeader()
    }

    let x = MARGIN + 2
    for (const col of COLS) {
      const text = truncate(font, col.get(row), col.width - 4, FONT_SIZE)
      page.drawText(text, {
        x,
        y: y - 7,
        size: FONT_SIZE,
        font,
        color: COLOR_TEXT,
      })
      x += col.width
    }

    page.drawLine({
      start: { x: MARGIN, y: y - ROW_H + 4 },
      end:   { x: PAGE_WIDTH - MARGIN, y: y - ROW_H + 4 },
      thickness: 0.4,
      color: COLOR_LINE,
    })

    y -= ROW_H
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

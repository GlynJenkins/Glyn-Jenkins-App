import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { DEJAVU_SANS_REGULAR_BASE64 } from './fonts/dejavu-sans-regular'
import { DEJAVU_SANS_BOLD_BASE64 } from './fonts/dejavu-sans-bold'

/**
 * Embed Unicode-capable fonts into a PDF document.
 *
 * The standard WinAnsi fonts (Helvetica etc.) throw on any character outside
 * Western-European encoding — so a worker named "Łukasz" would crash PDF
 * generation during registration. DejaVu Sans covers Latin Extended, Greek,
 * Cyrillic and more; `subset: true` keeps the output PDF small by embedding
 * only the glyphs actually used.
 */
export async function embedPdfFonts(pdf: PDFDocument): Promise<{ font: PDFFont; fontBold: PDFFont }> {
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(DEJAVU_SANS_REGULAR_BASE64, 'base64'), { subset: true })
  const fontBold = await pdf.embedFont(Buffer.from(DEJAVU_SANS_BOLD_BASE64, 'base64'), { subset: true })
  return { font, fontBold }
}

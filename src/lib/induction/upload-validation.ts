/** Shared upload rules for the public /api/induction registration path. */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024  // 1 MB

const DOCUMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
])

const SIGNATURE_MIME_TYPES = new Set(['image/png'])

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':       'jpg',
  'image/png':        'png',
  'image/heic':       'heic',
  'image/heif':       'heif',
  'image/webp':       'webp',
  'application/pdf':  'pdf',
}

const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF_MAGIC  = Buffer.from('%PDF')
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const WEBP_RIFF  = Buffer.from('RIFF')
const WEBP_WEBP  = Buffer.from('WEBP')

function looksLikeHeic(buf: Buffer): boolean {
  // ISO BMFF: bytes 4..8 are typically 'ftyp', then a brand like heic/heif/mif1
  if (buf.length < 12) return false
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false
  const brand = buf.toString('ascii', 8, 12).toLowerCase()
  return /heic|heif|mif1|msf1|hevc/.test(brand)
}

/** Detect MIME from magic bytes — don't trust the client Content-Type alone. */
export function detectUploadMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png'
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg'
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC)) return 'application/pdf'
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(WEBP_RIFF) &&
    buffer.subarray(8, 12).equals(WEBP_WEBP)
  ) {
    return 'image/webp'
  }
  if (looksLikeHeic(buffer)) return 'image/heic'
  return null
}

export function extensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'bin'
}

export type UploadKind = 'document' | 'signature'

/**
 * Validate size + declared type + magic bytes.
 * Returns `{ ok: true, mime, buffer }` or `{ ok: false, error }`.
 */
export async function validateUpload(
  file: File | null,
  kind: UploadKind,
  label: string,
): Promise<
  | { ok: true; mime: string; buffer: Buffer }
  | { ok: false; error: string }
> {
  if (!file || file.size <= 0) {
    return { ok: false, error: `${label} is required.` }
  }

  const maxBytes = kind === 'signature' ? MAX_SIGNATURE_BYTES : MAX_DOCUMENT_BYTES
  const maxMb = maxBytes / (1024 * 1024)
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `${label} must be under ${maxMb} MB.`,
    }
  }

  const allowed = kind === 'signature' ? SIGNATURE_MIME_TYPES : DOCUMENT_MIME_TYPES
  const declared = (file.type || '').toLowerCase()
  if (declared && !allowed.has(declared)) {
    return {
      ok: false,
      error: kind === 'signature'
        ? `${label} must be a PNG image.`
        : `${label} must be a PDF or image (JPEG, PNG, HEIC, WebP).`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = detectUploadMime(buffer)

  if (!detected || !allowed.has(detected)) {
    return {
      ok: false,
      error: kind === 'signature'
        ? `${label} must be a valid PNG image.`
        : `${label} must be a valid PDF or image under ${maxMb} MB.`,
    }
  }

  // Declared type (when present) must agree with the bytes.
  if (declared && declared !== detected) {
    // Allow heic/heif cross-label and jpeg aliases
    const heicFamily = (m: string) => m === 'image/heic' || m === 'image/heif'
    const jpegFamily = (m: string) => m === 'image/jpeg' || m === 'image/jpg'
    const match =
      declared === detected ||
      (heicFamily(declared) && heicFamily(detected)) ||
      (jpegFamily(declared) && jpegFamily(detected))
    if (!match) {
      return {
        ok: false,
        error: `${label} file contents do not match the declared type.`,
      }
    }
  }

  return { ok: true, mime: detected, buffer }
}

import convert from 'heic-convert'
import sharp from 'sharp'
import { isHeifBytes, looksLikeJpeg } from './photo-bytes'

/** Max pixel size before PDF embed — keeps aspect ratio, portrait stays portrait. */
export const QA_PHOTO_MAX_WIDTH  = 1200
export const QA_PHOTO_MAX_HEIGHT = 1600

async function heifToJpeg(buffer: Buffer): Promise<Buffer> {
  const out = await convert({
    buffer,
    format: 'JPEG',
    quality: 0.88,
  })
  return Buffer.from(out)
}

async function decodeToJpegBuffer(buffer: Buffer): Promise<Buffer> {
  const head = buffer.subarray(0, Math.min(buffer.length, 64))

  if (looksLikeJpeg(head)) {
    return buffer
  }

  if (isHeifBytes(head)) {
    return heifToJpeg(buffer)
  }

  return buffer
}

async function resizeForPdf(source: Buffer): Promise<Buffer> {
  const pipeline = sharp(source, {
    failOn: 'none',
    limitInputPixels: 268402689,
  })

  const meta = await pipeline.metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Could not read photo dimensions.')
  }

  const out = await pipeline
    .rotate()
    .resize(QA_PHOTO_MAX_WIDTH, QA_PHOTO_MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer()

  if (!out.length) {
    throw new Error('Could not process photo.')
  }

  return out
}

export async function normalizePhotoForPdf(buffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  let source: Buffer
  try {
    source = await decodeToJpegBuffer(buffer)
  } catch {
    throw new Error(
      'Could not read iPhone photo (HEIC). Try Settings → Camera → Formats → Most Compatible, then retake the photo.',
    )
  }

  try {
    const out = await resizeForPdf(source)
    return { buffer: out, mime: 'image/jpeg' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/heif|heic|bad seek/i.test(msg)) {
      try {
        const converted = await heifToJpeg(buffer)
        const out = await resizeForPdf(converted)
        return { buffer: out, mime: 'image/jpeg' }
      } catch {
        throw new Error(
          'Could not process iPhone photo (HEIC). Try Settings → Camera → Formats → Most Compatible, then retake the photo.',
        )
      }
    }
    throw err instanceof Error ? err : new Error('Could not process photo.')
  }
}

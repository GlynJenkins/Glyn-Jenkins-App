import sharp from 'sharp'

/** Max pixel size before PDF embed — keeps aspect ratio, portrait stays portrait. */
export const QA_PHOTO_MAX_WIDTH  = 1200
export const QA_PHOTO_MAX_HEIGHT = 1600

export async function normalizePhotoForPdf(buffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  const pipeline = sharp(buffer, {
    failOn: 'none',
    limitInputPixels: 268402689,
  })

  const meta = await pipeline.metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Could not read photo data.')
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

  return { buffer: out, mime: 'image/jpeg' }
}

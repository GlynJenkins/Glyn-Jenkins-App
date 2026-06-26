import sharp from 'sharp'

/** Max pixel size before PDF embed — keeps aspect ratio, portrait stays portrait. */
export const QA_PHOTO_MAX_WIDTH  = 1200
export const QA_PHOTO_MAX_HEIGHT = 1600

export async function normalizePhotoForPdf(buffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  const out = await sharp(buffer)
    .rotate() // apply EXIF orientation so phone photos are not sideways
    .resize(QA_PHOTO_MAX_WIDTH, QA_PHOTO_MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer()

  return { buffer: out, mime: 'image/jpeg' }
}

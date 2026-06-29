'use client'

import { isHeifBytes, looksLikeJpeg } from './photo-bytes'

const HEIC_RE = /\.(heic|heif)$/i

export function isHeicFile(file: File): boolean {
  const t = file.type.toLowerCase()
  return t === 'image/heic' || t === 'image/heif' || HEIC_RE.test(file.name)
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/i, '') || 'photo'
  return `${base}.jpg`
}

async function fileHead(file: File, bytes = 64): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer())
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

async function convertViaCanvas(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const maxSide = 2400
    let { width, height } = img
    if (width > maxSide || height > maxSide) {
      const scale = maxSide / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not available')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    })
    if (!blob) throw new Error('Could not convert image')
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function convertHeic(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 })
  const blob = Array.isArray(result) ? result[0] : result
  if (!blob) throw new Error('HEIC conversion failed')
  return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
}

async function assertJpegFile(file: File): Promise<File> {
  const head = await fileHead(file)
  if (looksLikeJpeg(head)) return file
  throw new Error('Photo conversion did not produce a JPEG.')
}

const HEIC_HELP =
  'Could not convert iPhone photo. Try Settings → Camera → Formats → Most Compatible, then retake the photo.'

/** Convert phone/gallery photos to JPEG in the browser so the server can always process them. */
export async function preparePhotoForUpload(file: File): Promise<File> {
  const head = await fileHead(file)
  const needsHeicConversion = isHeicFile(file) || isHeifBytes(head)

  if (needsHeicConversion) {
    try {
      return await assertJpegFile(await convertHeic(file))
    } catch {
      try {
        return await assertJpegFile(await convertViaCanvas(file))
      } catch {
        throw new Error(HEIC_HELP)
      }
    }
  }

  if (looksLikeJpeg(head)) {
    return file
  }

  try {
    return await assertJpegFile(await convertViaCanvas(file))
  } catch {
    throw new Error(HEIC_HELP)
  }
}

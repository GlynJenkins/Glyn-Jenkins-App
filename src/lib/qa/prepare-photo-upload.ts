'use client'

import { isHeifBytes, looksLikeJpeg } from './photo-bytes'

const HEIC_RE = /\.(heic|heif)$/i

export type PhotoUploadOptions = {
  /** Longest edge in pixels. Default 2400. */
  maxSide?: number
  /** JPEG quality 0–1. Default 0.88. */
  quality?: number
  /** Re-encode even when already JPEG (shrinks phone photos). */
  alwaysReencode?: boolean
  /** Target max file size; lowers quality until under this. */
  maxBytes?: number
}

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

async function canvasToJpegFile(
  file: File,
  opts: Required<Pick<PhotoUploadOptions, 'maxSide' | 'quality'>>
): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const maxSide = opts.maxSide
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
      canvas.toBlob(resolve, 'image/jpeg', opts.quality)
    })
    if (!blob) throw new Error('Could not convert image')
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function compressToMaxBytes(file: File, maxBytes: number, maxSide: number): Promise<File> {
  let quality = 0.82
  let side = maxSide
  let result = await canvasToJpegFile(file, { maxSide: side, quality })

  for (let attempt = 0; attempt < 8 && result.size > maxBytes; attempt++) {
    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.08)
    } else if (side > 800) {
      side = Math.round(side * 0.85)
      quality = 0.75
    } else {
      break
    }
    result = await canvasToJpegFile(result, { maxSide: side, quality })
  }

  if (result.size > maxBytes) {
    throw new Error('Photo is still too large after compression. Try a closer shot with less background.')
  }

  return result
}

async function convertHeic(file: File, quality: number): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality })
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

const DEFAULT_OPTS: Required<PhotoUploadOptions> = {
  maxSide:         2400,
  quality:         0.88,
  alwaysReencode:  false,
  maxBytes:        0,
}

/** Convert phone/gallery photos to JPEG in the browser so the server can always process them. */
export async function preparePhotoForUpload(
  file: File,
  options: PhotoUploadOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTS, ...options }
  const head = await fileHead(file)
  const needsHeicConversion = isHeicFile(file) || isHeifBytes(head)

  let working: File

  if (needsHeicConversion) {
    try {
      working = await assertJpegFile(await convertHeic(file, opts.quality))
    } catch {
      try {
        working = await canvasToJpegFile(file, { maxSide: opts.maxSide, quality: opts.quality })
      } catch {
        throw new Error(HEIC_HELP)
      }
    }
  } else if (opts.alwaysReencode || !looksLikeJpeg(head)) {
    working = await canvasToJpegFile(file, { maxSide: opts.maxSide, quality: opts.quality })
  } else {
    working = file
  }

  if (opts.maxBytes > 0 && working.size > opts.maxBytes) {
    working = await compressToMaxBytes(working, opts.maxBytes, opts.maxSide)
  } else if (opts.alwaysReencode && opts.maxBytes === 0 && working.size > 900_000) {
    working = await compressToMaxBytes(working, 900_000, opts.maxSide)
  }

  return working
}

/** Smaller upload for variation proof photos (stays under platform body limits). */
export function prepareVariationPhotoForUpload(file: File): Promise<File> {
  return preparePhotoForUpload(file, {
    maxSide:        1400,
    quality:        0.82,
    alwaysReencode: true,
    maxBytes:       900_000,
  })
}

/** Same compression as variations — site photos, one upload per request on the server. */
export function prepareFiresockPhotoForUpload(file: File): Promise<File> {
  return prepareVariationPhotoForUpload(file)
}

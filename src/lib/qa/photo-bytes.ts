/** Magic-byte helpers shared by client upload prep and server normalisation. */

export function isJpegBytes(data: Uint8Array): boolean {
  return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
}

export function isHeifBytes(data: Uint8Array): boolean {
  if (data.length < 12) return false
  const ftyp = String.fromCharCode(data[4] ?? 0, data[5] ?? 0, data[6] ?? 0, data[7] ?? 0)
  if (ftyp !== 'ftyp') return false
  const header = new TextDecoder().decode(data.slice(0, Math.min(data.length, 64)))
  return /heic|heix|heif|mif1|msf1|hevc|hevx/i.test(header)
}

export function looksLikeHeif(data: Uint8Array): boolean {
  return isHeifBytes(data)
}

export function looksLikeJpeg(data: Uint8Array): boolean {
  return isJpegBytes(data) && !isHeifBytes(data)
}

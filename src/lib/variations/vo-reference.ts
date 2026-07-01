/** Format a stored site code for display (pads numeric codes to 3 digits). */
export function formatSiteCode(siteCode: string | null | undefined): string {
  if (!siteCode?.trim()) return '—'
  const trimmed = siteCode.trim()
  if (/^\d+$/.test(trimmed)) return trimmed.padStart(3, '0')
  return trimmed
}

/** Format VO sequence as V01, V02, … */
export function formatVoNumber(voNumber: number | null | undefined): string {
  if (!voNumber || voNumber < 1) return '—'
  return `V${String(voNumber).padStart(2, '0')}`
}

/** Combined reference shown on PDFs and registers, e.g. 001-V01. */
export function formatVariationReference(
  siteCode: string | null | undefined,
  voNumber: number | null | undefined
): string {
  const code = formatSiteCode(siteCode)
  const vo   = formatVoNumber(voNumber)
  if (code === '—' || vo === '—') return '—'
  return `${code}-${vo}`
}

export async function allocateNextSiteCode(
  supabase: Pick<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>, 'from'>
): Promise<string> {
  const { data: sites } = await supabase
    .from('sites')
    .select('site_code')
    .not('site_code', 'is', null)

  let max = 0
  for (const row of sites ?? []) {
    const code = (row as { site_code: string | null }).site_code
    if (code && /^\d+$/.test(code)) {
      max = Math.max(max, parseInt(code, 10))
    }
  }

  return String(max + 1).padStart(3, '0')
}


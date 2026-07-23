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

type VoClaimRow = {
  id:          string
  site_id:     string
  photo_urls:  string[] | null
  vo_number:   number | null
  approved_at: string | null
}

function voGroupKey(claim: Pick<VoClaimRow, 'id' | 'photo_urls'>): string {
  return (claim.photo_urls ?? [])[0] ?? claim.id
}

/**
 * Allocate and persist vo_number for any approved-but-unnumbered claims on the
 * sites touched by `claimIds`. Numbers are allocated once (max + 1 per site)
 * and never recomputed, so re-approving one variation cannot renumber others.
 *
 * Non-fatal by design: if the vo_number column is missing (migration not yet
 * run) this logs and returns — the register falls back to computed numbering.
 */
export async function allocateVoNumbersForClaims(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>,
  claimIds: string[],
): Promise<void> {
  if (claimIds.length === 0) return

  try {
    const { data: targets, error: targetsError } = await supabase
      .from('variation_claims')
      .select('id, site_id, photo_urls, vo_number, approved_at')
      .in('id', claimIds)
    if (targetsError) throw targetsError

    const siteIds = [...new Set(
      ((targets ?? []) as VoClaimRow[])
        .filter((c) => c.vo_number == null)
        .map((c) => c.site_id),
    )]

    for (const siteId of siteIds) {
      const { data: siteClaims, error: siteError } = await supabase
        .from('variation_claims')
        .select('id, site_id, photo_urls, vo_number, approved_at')
        .eq('site_id', siteId)
        .eq('status', 'approved')
      if (siteError) throw siteError

      const rows = (siteClaims ?? []) as VoClaimRow[]
      let maxVo = 0
      for (const row of rows) {
        if (row.vo_number != null && row.vo_number > maxVo) maxVo = row.vo_number
      }

      // Group unnumbered claims by submission (photo group), oldest approval first.
      const groups = new Map<string, { ids: string[]; firstApproved: string | null }>()
      for (const row of rows) {
        if (row.vo_number != null) continue
        const key = voGroupKey(row)
        const g = groups.get(key) ?? { ids: [], firstApproved: null }
        g.ids.push(row.id)
        if (row.approved_at && (!g.firstApproved || row.approved_at < g.firstApproved)) {
          g.firstApproved = row.approved_at
        }
        groups.set(key, g)
      }

      const ordered = [...groups.values()].sort((a, b) =>
        (a.firstApproved ?? '9999').localeCompare(b.firstApproved ?? '9999'),
      )

      for (const group of ordered) {
        maxVo += 1
        const { error: updateError } = await supabase
          .from('variation_claims')
          .update({ vo_number: maxVo })
          .in('id', group.ids)
        if (updateError) throw updateError
      }
    }
  } catch (err) {
    console.error('[VO numbers] Allocation failed (has the vo_number migration been run?):', err)
  }
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


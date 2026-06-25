/** Keep only the latest claim per foreman per fortnight (handles stale duplicates). */
export function dedupeClaimsByForemanPeriod<T extends {
  foreman_id: string
  period_start: string
  period_end: string
  submitted_at: string | null
}>(claims: T[]): T[] {
  const map = new Map<string, T>()

  for (const claim of claims) {
    const key = `${claim.foreman_id}|${claim.period_start}|${claim.period_end}`
    const prev = map.get(key)
    if (!prev || new Date(claim.submitted_at ?? 0) > new Date(prev.submitted_at ?? 0)) {
      map.set(key, claim)
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime()
  )
}

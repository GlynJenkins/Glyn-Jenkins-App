import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasClaimSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentFortnight, toLocalDateString } from '@/lib/fortnight'
import { deleteClaimPeriod } from '@/lib/claims/delete-claim-period'

type PoolItem = {
  type:       string
  id:         string
  label:      string
  amount:     number
  fullValue?: number   // only present for grid_cell items
  siteId?:    string
}

export async function POST(request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as {
      siteId:        string | null   // null for multi-site claims
      foremanId:     string
      poolTotal:     number
      poolItems:     PoolItem[]
      allocations:   { workerId: string; grossAmount: number }[]
      apprenticeDays:{ workerId: string; collegeDays: number; holidayDays: number }[]
      variationIds:  string[]
    }

    const { siteId, foremanId, poolTotal, poolItems, allocations, apprenticeDays, variationIds } = body

    if (!foremanId || !allocations?.length) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    if (foremanId !== auth.worker.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const hasSiteAccess = await foremanHasClaimSiteAccess(
      auth.worker.id,
      siteId,
      poolItems ?? [],
    )
    if (!hasSiteAccess) {
      return NextResponse.json({ error: 'Forbidden — site not assigned to you.' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const period = await getCurrentFortnight(supabase)
    if (period.isLocked) {
      return NextResponse.json({ error: 'Submission window is locked.' }, { status: 403 })
    }

    const periodStart = toLocalDateString(period.start)
    const periodEnd   = toLocalDateString(period.end)

    const { data: existingRows } = await supabase
      .from('claim_periods')
      .select('id, status')
      .eq('foreman_id', foremanId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .order('submitted_at', { ascending: false })
      .limit(1)

    const existingClaim = existingRows?.[0] ?? null

    if (existingClaim) {
      if (existingClaim.status === 'pending') {
        return NextResponse.json(
          { error: 'You have already submitted a claim for this fortnight. Withdraw it from your dashboard to make changes.' },
          { status: 409 }
        )
      }
      if (existingClaim.status === 'approved') {
        return NextResponse.json(
          { error: 'Your claim for this fortnight has already been approved.' },
          { status: 409 }
        )
      }
      if (existingClaim.status === 'rejected') {
        const removed = await deleteClaimPeriod(existingClaim.id)
        if (!removed.ok) {
          return NextResponse.json({ error: removed.error }, { status: 500 })
        }
      } else {
        return NextResponse.json(
          { error: 'You have already submitted a claim for this fortnight.' },
          { status: 409 }
        )
      }
    }

    // ── Create claim period ──────────────────────────────────────────────
    const { data: claim, error: claimErr } = await supabase
      .from('claim_periods')
      .insert({
        site_id:      siteId,
        foreman_id:   foremanId,
        period_start: periodStart,
        period_end:   periodEnd,
        pool_total:   poolTotal,
        pool_items:   poolItems,
        status:       'pending',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (claimErr || !claim) {
      return NextResponse.json({ error: claimErr?.message ?? 'Failed to create claim.' }, { status: 500 })
    }

    // ── Worker allocations ───────────────────────────────────────────────
    const allocationRows = allocations
      .filter((a) => a.grossAmount > 0)
      .map((a) => ({
        claim_period_id: claim.id,
        worker_id:       a.workerId,
        gross_amount:    a.grossAmount,
      }))

    if (allocationRows.length > 0) {
      const { error: allocErr } = await supabase.from('claim_allocations').insert(allocationRows)
      if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 })
    }

    // ── Apprentice day ledger entries ────────────────────────────────────
    for (const entry of (apprenticeDays ?? [])) {
      if (entry.collegeDays > 0) {
        await supabase.from('apprentice_holiday_ledger').insert({
          worker_id: entry.workerId, claim_period_id: claim.id,
          day_type: 'college', days: entry.collegeDays, amount: entry.collegeDays * 50,
        })
      }
      if (entry.holidayDays > 0) {
        await supabase.from('apprentice_holiday_ledger').insert({
          worker_id: entry.workerId, claim_period_id: claim.id,
          day_type: 'holiday', days: entry.holidayDays, amount: entry.holidayDays * 50,
        })
      }
    }

    // ── Mark variations as claimed ───────────────────────────────────────
    if (variationIds?.length > 0) {
      await supabase
        .from('variation_claims')
        .update({ claimed_in_period_id: claim.id })
        .in('id', variationIds)
    }

    // ── Update price_grid cells: increment total_claimed_pct + auto colour ──
    const gridItems = (poolItems ?? []).filter((p) => p.type === 'grid_cell')
    for (const item of gridItems) {
      if (!item.id || !item.fullValue) continue

      // Fetch current claimed pct
      const { data: cell } = await supabase
        .from('price_grid')
        .select('total_claimed_pct')
        .eq('id', item.id)
        .single()

      const currentPct = cell?.total_claimed_pct ?? 0
      const addedPct   = Math.round((item.amount / item.fullValue) * 100)
      const newPct     = Math.min(100, currentPct + addedPct)

      // White → Orange (partial) → Blue (fully submitted, awaiting admin approval)
      const newColor = newPct >= 100 ? 'blue' : 'orange'

      await supabase
        .from('price_grid')
        .update({ total_claimed_pct: newPct, cell_color: newColor })
        .eq('id', item.id)
    }

    return NextResponse.json({ success: true, claimId: claim.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'
import { calculatePayLine } from './calculate-pay'
import { resolveClaimLedgerSiteId } from './resolve-claim-site'

type AllocationRow = {
  id: string
  worker_id: string
  gross_amount: number | null
  claim_periods: {
    id: string
    site_id: string | null
    foreman_id: string | null
    status: string
    approved_at: string | null
    pool_items: { type: string; id: string; amount: number; siteId?: string }[] | null
  } | {
    id: string
    site_id: string | null
    foreman_id: string | null
    status: string
    approved_at: string | null
    pool_items: { type: string; id: string; amount: number; siteId?: string }[] | null
  }[] | null
}

type WorkerRow = {
  id: string
  tax_type: string | null
  role: string | null
  has_personal_insurance: boolean | null
}

export type CisLedgerSyncResult = {
  inserted: number
  skipped:  number
  errors:   string[]
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/**
 * Create missing worker_cis_ledger rows from approved claim allocations.
 * Safe to run repeatedly — skips allocations that already have a ledger row.
 */
export async function syncMissingCisLedger(
  supabase: SupabaseClient,
  opts?: { workerId?: string },
): Promise<CisLedgerSyncResult> {
  const result: CisLedgerSyncResult = { inserted: 0, skipped: 0, errors: [] }

  let allocQuery = supabase
    .from('claim_allocations')
    .select(`
      id, worker_id, gross_amount,
      claim_periods!inner ( id, site_id, foreman_id, status, approved_at, pool_items )
    `)
    .gt('gross_amount', 0)

  if (opts?.workerId) {
    allocQuery = allocQuery.eq('worker_id', opts.workerId)
  }

  const { data: allocations, error: allocErr } = await allocQuery
  if (allocErr) {
    result.errors.push(allocErr.message)
    return result
  }

  const approved = (allocations ?? []).filter((row) => {
    const claim = relationOne((row as AllocationRow).claim_periods)
    return claim?.status === 'approved'
  }) as AllocationRow[]

  if (!approved.length) return result

  const allocationIds = approved.map((a) => a.id)
  const existingIds = new Set<string>()

  for (let i = 0; i < allocationIds.length; i += 200) {
    const chunk = allocationIds.slice(i, i + 200)
    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from('worker_cis_ledger')
      .select('claim_allocation_id')
      .in('claim_allocation_id', chunk)

    if (ledgerErr) {
      result.errors.push(ledgerErr.message)
      return result
    }

    for (const row of ledgerRows ?? []) {
      if (row.claim_allocation_id) existingIds.add(row.claim_allocation_id)
    }
  }

  const missing = approved.filter((a) => !existingIds.has(a.id))
  result.skipped = approved.length - missing.length
  if (!missing.length) return result

  const workerIds = [...new Set(missing.map((a) => a.worker_id))]
  const workerMap = new Map<string, WorkerRow>()

  for (let i = 0; i < workerIds.length; i += 200) {
    const chunk = workerIds.slice(i, i + 200)
    const { data: workers, error: workerErr } = await supabase
      .from('workers')
      .select('id, tax_type, role, has_personal_insurance')
      .in('id', chunk)

    if (workerErr) {
      result.errors.push(workerErr.message)
      return result
    }

    for (const worker of workers ?? []) {
      workerMap.set(worker.id, worker)
    }
  }

  const fees = await fetchPayFeeSettings()
  const siteCache = new Map<string, string>()

  for (const alloc of missing) {
    const claim = relationOne(alloc.claim_periods)
    const worker = workerMap.get(alloc.worker_id)
    if (!claim || !worker) {
      result.errors.push(`Missing worker or claim for allocation ${alloc.id}`)
      continue
    }

    let ledgerSiteId = siteCache.get(claim.id)
    if (!ledgerSiteId) {
      const resolved = await resolveClaimLedgerSiteId(supabase, claim)
      if (!resolved) {
        result.errors.push(`Could not resolve site for claim ${claim.id}`)
        continue
      }
      ledgerSiteId = resolved
      siteCache.set(claim.id, ledgerSiteId)
    }

    const gross = alloc.gross_amount ?? 0
    if (gross <= 0) continue

    const pay = calculatePayLine(gross, worker, fees)
    const dateOfPay = claim.approved_at
      ? new Date(claim.approved_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    const { error: insertErr } = await supabase.from('worker_cis_ledger').insert({
      worker_id:             worker.id,
      claim_period_id:       claim.id,
      claim_allocation_id:   alloc.id,
      site_id:               ledgerSiteId,
      date_of_pay:           dateOfPay,
      gross_pay:             pay.gross,
      admin_fee:             pay.adminFee,
      insurance_fee:         pay.insuranceFee,
      custom_deduction:      pay.customDeduction,
      custom_deduction_note: null,
      cis_tax_deducted:      pay.cisTax,
      // NI intentionally 0 — handled in payroll after export (23 Jul 2026).
      national_insurance:    0,
      net_pay:               pay.net,
    })

    if (insertErr) {
      result.errors.push(`${worker.id}: ${insertErr.message}`)
      continue
    }

    result.inserted++
  }

  return result
}

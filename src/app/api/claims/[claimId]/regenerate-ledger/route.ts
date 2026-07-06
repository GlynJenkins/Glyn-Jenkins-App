import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'
import { calculatePayLine } from '@/lib/cis/calculate-pay'
import { buildLedgerPayeeSnapshot } from '@/lib/cis/ledger-payee'
import { resolveClaimLedgerSiteId } from '@/lib/cis/resolve-claim-site'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimId } = await params
    const supabase = createServiceClient()

    // Only allow for approved claims
    const { data: claimBase } = await supabase
      .from('claim_periods')
      .select('id, site_id, foreman_id, status, approved_at, pool_items, claim_allocations ( id, worker_id, gross_amount )')
      .eq('id', claimId)
      .eq('status', 'approved')
      .single()

    if (!claimBase) {
      return NextResponse.json({ error: 'Approved claim not found.' }, { status: 404 })
    }

    const ledgerSiteId = await resolveClaimLedgerSiteId(supabase, claimBase)
    if (!ledgerSiteId) {
      return NextResponse.json(
        { error: 'Could not determine site for this claim — check pool items are linked to sites.' },
        { status: 422 },
      )
    }

    // Enrich allocations with worker details
    const enrichedAllocations = await Promise.all(
      (claimBase.claim_allocations ?? []).map(async (alloc) => {
        const { data: worker } = await supabase
          .from('workers')
          .select('id, first_name, surname, tax_type, role, has_personal_insurance, bank_sort_code, bank_account_number')
          .eq('id', alloc.worker_id)
          .maybeSingle()
        return { ...alloc, worker }
      })
    )

    const fees = await fetchPayFeeSettings()

    // Delete any existing ledger rows for this claim (idempotent)
    await supabase
      .from('worker_cis_ledger')
      .delete()
      .eq('claim_period_id', claimId)

    const dateOfPay = claimBase.approved_at
      ? new Date(claimBase.approved_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    let count = 0
    for (const alloc of enrichedAllocations) {
      const worker = alloc.worker
      if (!worker) continue

      const gross = alloc.gross_amount ?? 0
      const pay = calculatePayLine(
        gross,
        {
          id: worker.id,
          tax_type: worker.tax_type,
          has_personal_insurance: worker.has_personal_insurance,
          role: worker.role,
        },
        fees,
      )

      const payee = buildLedgerPayeeSnapshot(worker)

      const { error } = await supabase.from('worker_cis_ledger').insert({
        worker_id:             worker.id,
        claim_period_id:       claimId,
        claim_allocation_id:   alloc.id,
        site_id:               ledgerSiteId,
        date_of_pay:           dateOfPay,
        gross_pay:             pay.gross,
        admin_fee:             pay.adminFee,
        insurance_fee:         pay.insuranceFee,
        custom_deduction:      0,
        cis_tax_deducted:      pay.cisTax,
        national_insurance:    0,
        net_pay:               pay.net,
        payee_name:            payee.payee_name,
        payee_sort_code:       payee.payee_sort_code,
        payee_account_number:  payee.payee_account_number,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      count++
    }

    return NextResponse.json({ success: true, count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

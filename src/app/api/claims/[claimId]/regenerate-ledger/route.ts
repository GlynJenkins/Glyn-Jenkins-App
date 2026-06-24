import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_ADMIN_FEE     = 6
const DEFAULT_INSURANCE_FEE = 3
const CIS_RATE              = 0.20

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
      .select('id, site_id, status, approved_at, claim_allocations ( id, worker_id, gross_amount )')
      .eq('id', claimId)
      .eq('status', 'approved')
      .single()

    if (!claimBase) {
      return NextResponse.json({ error: 'Approved claim not found.' }, { status: 404 })
    }

    // Enrich allocations with worker details
    const enrichedAllocations = await Promise.all(
      (claimBase.claim_allocations ?? []).map(async (alloc) => {
        const { data: worker } = await supabase
          .from('workers')
          .select('id, first_name, surname, tax_type, has_personal_insurance')
          .eq('id', alloc.worker_id)
          .maybeSingle()
        return { ...alloc, worker }
      })
    )

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('global_admin_fee, insurance_fee')
      .limit(1)
      .maybeSingle()

    const adminFeeDefault     = settings?.global_admin_fee ?? DEFAULT_ADMIN_FEE
    const insuranceFeeDefault = settings?.insurance_fee    ?? DEFAULT_INSURANCE_FEE

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

      const gross        = alloc.gross_amount ?? 0
      const adminFee     = adminFeeDefault
      const insuranceFee = (worker.has_personal_insurance) ? 0 : insuranceFeeDefault
      const taxable      = Math.max(0, gross - adminFee - insuranceFee)
      const cisTax       = worker.tax_type === 'cis_20'
        ? Math.round(taxable * CIS_RATE * 100) / 100
        : 0
      const net          = Math.round((taxable - cisTax) * 100) / 100

      const { error } = await supabase.from('worker_cis_ledger').insert({
        worker_id:             worker.id,
        claim_period_id:       claimId,
        claim_allocation_id:   alloc.id,
        site_id:               claimBase.site_id,
        date_of_pay:           dateOfPay,
        gross_pay:             gross,
        admin_fee:             adminFee,
        insurance_fee:         insuranceFee,
        custom_deduction:      0,
        cis_tax_deducted:      cisTax,
        net_pay:               net,
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

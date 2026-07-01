import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { computeRegisterNet, isApprenticeEmployed } from '@/lib/claims/load-wages-register'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ledgerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { ledgerId } = await params
    const body = await request.json() as { tax?: number; nationalInsurance?: number }

    const supabase = createServiceClient()

    const { data: ledger } = await supabase
      .from('worker_cis_ledger')
      .select(`
        id, gross_pay, admin_fee, insurance_fee, custom_deduction,
        cis_tax_deducted, national_insurance,
        workers ( role )
      `)
      .eq('id', ledgerId)
      .maybeSingle()

    if (!ledger) {
      return NextResponse.json({ error: 'Pay record not found.' }, { status: 404 })
    }

    const worker = Array.isArray(ledger.workers) ? ledger.workers[0] : ledger.workers
    if (!worker || !isApprenticeEmployed(worker.role)) {
      return NextResponse.json(
        { error: 'Tax and NI can only be edited for employed apprentices.' },
        { status: 422 },
      )
    }

    const tax = body.tax ?? ledger.cis_tax_deducted ?? 0
    const nationalInsurance = body.nationalInsurance ?? ledger.national_insurance ?? 0

    if (tax < 0 || nationalInsurance < 0) {
      return NextResponse.json({ error: 'Amounts cannot be negative.' }, { status: 400 })
    }

    const fees =
      (ledger.admin_fee ?? 0) +
      (ledger.insurance_fee ?? 0) +
      (ledger.custom_deduction ?? 0)

    const netPay = computeRegisterNet(ledger.gross_pay ?? 0, fees, tax, nationalInsurance)

    const { error } = await supabase
      .from('worker_cis_ledger')
      .update({
        cis_tax_deducted:   tax,
        national_insurance: nationalInsurance,
        net_pay:            netPay,
      })
      .eq('id', ledgerId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, tax, nationalInsurance, netPay })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed.' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPayFeeSettings } from '@/lib/admin/settings-fees'
import { calculatePayLine } from '@/lib/cis/calculate-pay'
import { buildLedgerPayeeSnapshot } from '@/lib/cis/ledger-payee'
import { resolveClaimLedgerSiteId } from '@/lib/cis/resolve-claim-site'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimId } = await params
    const body = await request.json() as {
      workerDeductions?: Record<string, { amount: number; reason: string }>
    }
    const workerDeductions = body.workerDeductions ?? {}

    const supabase = createServiceClient()

    // ── Fetch claim + allocations ──────────────────────────────────────
    const { data: claimBase } = await supabase
      .from('claim_periods')
      .select('id, site_id, foreman_id, pool_items, status, period_end, claim_allocations ( id, worker_id, gross_amount )')
      .eq('id', claimId)
      .eq('status', 'pending')
      .single()

    // Enrich allocations with worker details (single batched query)
    const workerIds = [...new Set((claimBase?.claim_allocations ?? []).map((a) => a.worker_id))]
    const { data: workerRows } = workerIds.length > 0
      ? await supabase
          .from('workers')
          .select('id, first_name, surname, phone, email, tax_type, role, has_personal_insurance, bank_sort_code, bank_account_number')
          .in('id', workerIds)
      : { data: [] }
    const workerById = new Map((workerRows ?? []).map((w) => [w.id, w]))

    const enrichedAllocations = (claimBase?.claim_allocations ?? []).map((alloc) => {
      const worker = workerById.get(alloc.worker_id)
      return {
        ...alloc,
        workers: worker
          ? { ...worker, has_own_insurance: worker.has_personal_insurance ?? false }
          : null,
      }
    })

    const claim = claimBase ? { ...claimBase, claim_allocations: enrichedAllocations } : null

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found or already processed.' }, { status: 404 })
    }

    const fees = await fetchPayFeeSettings()

    const ledgerSiteId = await resolveClaimLedgerSiteId(supabase, claim)
    if (!ledgerSiteId) {
      return NextResponse.json(
        { error: 'Could not determine site for this claim — check pool items are linked to sites.' },
        { status: 422 },
      )
    }

    // ── Calculate and insert CIS ledger rows ───────────────────────────
    const allocations = (claim.claim_allocations ?? []) as {
      id: string
      worker_id: string
      gross_amount: number
      workers: {
        id: string
        first_name: string
        surname: string
        phone: string | null
        email: string | null
        tax_type: string
        role: string
        has_own_insurance: boolean | null
        bank_sort_code: string | null
        bank_account_number: string | null
      } | null
    }[]

    const payslips: { worker: typeof allocations[0]['workers']; gross: number; cisTax: number; adminFee: number; insuranceFee: number; customDed: number; net: number }[] = []

    // Attribute pay to the claim's fortnight, not the (possibly late) approval date.
    const dateOfPay = (claim as { period_end?: string | null }).period_end
      ?? new Date().toISOString().split('T')[0]

    // ── Build every ledger row up front (nothing written yet) ──────────
    const ledgerRows: Record<string, unknown>[] = []

    for (const alloc of allocations) {
      const worker = alloc.workers
      if (!worker) continue

      const gross         = alloc.gross_amount ?? 0
      // Clamp: a negative deduction must never increase pay.
      const rawDed        = workerDeductions[worker.id]?.amount ?? 0
      const customDed     = typeof rawDed === 'number' && isFinite(rawDed) ? Math.max(0, rawDed) : 0
      const customReason  = workerDeductions[worker.id]?.reason ?? null
      const pay = calculatePayLine(
        gross,
        {
          id: worker.id,
          tax_type: worker.tax_type,
          has_personal_insurance: worker.has_own_insurance,
          role: worker.role,
        },
        fees,
        customDed,
      )

      const payee = buildLedgerPayeeSnapshot({
        first_name:          worker.first_name,
        surname:             worker.surname,
        bank_sort_code:      worker.bank_sort_code,
        bank_account_number: worker.bank_account_number,
      })

      ledgerRows.push({
        worker_id:             worker.id,
        claim_period_id:       claimId,
        claim_allocation_id:   alloc.id,
        site_id:               ledgerSiteId,
        date_of_pay:           dateOfPay,
        gross_pay:             pay.gross,
        admin_fee:             pay.adminFee,
        insurance_fee:         pay.insuranceFee,
        custom_deduction:      pay.customDeduction, // capped to what actually reduced pay
        custom_deduction_note: customReason,
        cis_tax_deducted:      pay.cisTax,
        // NI is intentionally 0 here — it is handled in payroll software
        // AFTER wages are exported from the app (confirmed 23 Jul 2026).
        national_insurance:    0,
        net_pay:               pay.net,
        payee_name:            payee.payee_name,
        payee_sort_code:       payee.payee_sort_code,
        payee_account_number:  payee.payee_account_number,
      })

      payslips.push({
        worker,
        gross: pay.gross,
        cisTax: pay.cisTax,
        adminFee: pay.adminFee,
        insuranceFee: pay.insuranceFee,
        customDed: pay.customDeduction,
        net: pay.net,
      })
    }

    // ── Flip pending → approved atomically FIRST ────────────────────────
    // The conditional update means only one request wins a double-click or
    // two-admins race; the loser gets zero rows back and stops here.
    const { data: flipped, error: flipErr } = await supabase
      .from('claim_periods')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', claimId)
      .eq('status', 'pending')
      .select('id')

    if (flipErr || !flipped?.length) {
      return NextResponse.json(
        { error: 'Claim was already processed by another request.' },
        { status: 409 },
      )
    }

    // ── Write all pay rows in ONE statement (all-or-nothing) ───────────
    // The unique index on claim_allocation_id makes retries safe: a re-run
    // after a partial failure can never create duplicate pay rows.
    if (ledgerRows.length > 0) {
      const { error: ledgerErr } = await supabase.from('worker_cis_ledger').insert(ledgerRows)

      if (ledgerErr && ledgerErr.code !== '23505') {
        // Revert so the admin can retry cleanly. Log details server-side only.
        console.error('[Claim approval] ledger insert failed:', ledgerErr)
        await supabase
          .from('claim_periods')
          .update({ status: 'pending', approved_at: null })
          .eq('id', claimId)
        return NextResponse.json(
          { error: 'Could not write pay records — the claim was NOT approved. Please try again.' },
          { status: 500 },
        )
      }
      // 23505 (duplicate) means rows already exist from a previous attempt — safe to continue.
    }

    // ── Promote fully-claimed cells from blue → green ─────────────────
    const poolItems = (claim.pool_items ?? []) as { type: string; id: string }[]
    const gridIds   = poolItems.filter((p) => p.type === 'grid_cell').map((p) => p.id)
    if (gridIds.length > 0) {
      await supabase
        .from('price_grid')
        .update({ cell_color: 'green' })
        .in('id', gridIds)
        .eq('cell_color', 'blue')  // only cells fully submitted (not partial orange)
    }

    // ── Send SMS payslips (if Twilio configured) ──────────────────────
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN   &&
      process.env.TWILIO_MESSAGING_SERVICE_SID
    ) {
      const twilio = (await import('twilio')).default
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

      for (const p of payslips) {
        if (!p.worker?.phone) continue
        const msg =
          `Glyn Jenkins: Pay approved.\n` +
          `Gross: £${p.gross.toFixed(2)}\n` +
          `Admin Fee: -£${p.adminFee.toFixed(2)}\n` +
          `Insurance: -£${p.insuranceFee.toFixed(2)}\n` +
          (p.customDed > 0 ? `Deduction: -£${p.customDed.toFixed(2)}\n` : '') +
          (p.cisTax   > 0 ? `CIS Tax: -£${p.cisTax.toFixed(2)}\n`    : '') +
          `NET PAY: £${p.net.toFixed(2)}`

        await client.messages.create({
          from: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to:   p.worker.phone,
          body: msg,
        }).catch(() => null)
      }
    }

    // ── Send email payslips (if Resend configured) ─────────────────────
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend     = new Resend(process.env.RESEND_API_KEY)
      const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'payroll@glynjenkins.co.uk'

      for (const p of payslips) {
        const worker = p.worker
        if (!worker?.email) continue

        const fmtGBP = (n: number) =>
          '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

        const html = `
          <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
          <body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
            <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;
                        overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <div style="background:#0f172a;padding:28px 28px 20px;">
                <p style="color:#fb923c;font-size:11px;font-weight:700;letter-spacing:2px;
                           text-transform:uppercase;margin:0 0 6px;">Glyn Jenkins LTD</p>
                <h1 style="color:#fff;font-size:20px;margin:0;">Pay Notification</h1>
              </div>
              <div style="padding:24px 28px;">
                <p style="color:#475569;font-size:14px;margin:0 0 20px;">
                  Hi ${worker.first_name}, your fortnightly pay has been approved and processed.
                </p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr style="background:#f8fafc;">
                    <td style="padding:10px 12px;font-size:13px;color:#64748b;">Gross Pay</td>
                    <td style="padding:10px 12px;font-size:13px;font-weight:600;
                               color:#1e293b;text-align:right;">${fmtGBP(p.gross)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;font-size:13px;color:#64748b;">Admin Fee</td>
                    <td style="padding:10px 12px;font-size:13px;color:#1e293b;
                               text-align:right;">-${fmtGBP(p.adminFee)}</td>
                  </tr>
                  ${p.insuranceFee > 0 ? `
                  <tr style="background:#f8fafc;">
                    <td style="padding:10px 12px;font-size:13px;color:#64748b;">Insurance Fee</td>
                    <td style="padding:10px 12px;font-size:13px;color:#1e293b;
                               text-align:right;">-${fmtGBP(p.insuranceFee)}</td>
                  </tr>` : ''}
                  ${p.customDed > 0 ? `
                  <tr>
                    <td style="padding:10px 12px;font-size:13px;color:#ef4444;">Deduction</td>
                    <td style="padding:10px 12px;font-size:13px;color:#ef4444;
                               text-align:right;">-${fmtGBP(p.customDed)}</td>
                  </tr>` : ''}
                  ${p.cisTax > 0 ? `
                  <tr style="background:#f8fafc;">
                    <td style="padding:10px 12px;font-size:13px;color:#3b82f6;">CIS Tax (20%)</td>
                    <td style="padding:10px 12px;font-size:13px;color:#3b82f6;
                               text-align:right;">-${fmtGBP(p.cisTax)}</td>
                  </tr>` : ''}
                  <tr style="background:#0f172a;">
                    <td style="padding:14px 12px;font-size:15px;font-weight:700;color:#fff;">
                      NET PAY</td>
                    <td style="padding:14px 12px;font-size:15px;font-weight:700;
                               color:#fb923c;text-align:right;">${fmtGBP(p.net)}</td>
                  </tr>
                </table>
                <p style="color:#94a3b8;font-size:11px;margin:20px 0 0;text-align:center;">
                  Glyn Jenkins LTD &bull; This is an automated payslip notification.<br/>
                  Keep this email for your HMRC records.
                </p>
              </div>
            </div>
          </body></html>`

        await resend.emails.send({
          from:    `Glyn Jenkins LTD <${fromEmail}>`,
          to:      worker.email,
          subject: `Pay Notification — ${fmtGBP(p.net)} Net Pay`,
          html,
        }).catch(() => null)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

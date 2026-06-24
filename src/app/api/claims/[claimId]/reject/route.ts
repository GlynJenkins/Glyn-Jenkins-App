import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ claimId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { claimId }      = await params
    const { reason }       = await request.json() as { reason: string }
    const supabase         = createServiceClient()

    // ── Fetch claim to get pool_items + foreman details ────────────────
    const { data: claimBase } = await supabase
      .from('claim_periods')
      .select('id, pool_items, foreman_id, period_start, period_end, pool_total, site_id')
      .eq('id', claimId)
      .eq('status', 'pending')
      .single()

    const { data: foremanData } = claimBase
      ? await supabase
          .from('workers')
          .select('first_name, surname, phone, email')
          .eq('id', claimBase.foreman_id)
          .maybeSingle()
      : { data: null }

    let siteName: string | null = null
    if (claimBase?.site_id) {
      const { data: site } = await supabase
        .from('sites')
        .select('name')
        .eq('id', claimBase.site_id)
        .maybeSingle()
      siteName = site?.name ?? null
    }

    const claim = claimBase ? { ...claimBase, workers: foremanData, siteName } : null

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found or already processed.' }, { status: 404 })
    }

    // ── Restore price_grid cells (undo total_claimed_pct increment) ────
    const poolItems = (claim.pool_items ?? []) as {
      type: string; id: string; amount: number; fullValue?: number
    }[]

    for (const item of poolItems.filter((p) => p.type === 'grid_cell')) {
      if (!item.id || !item.fullValue) continue

      const { data: cell } = await supabase
        .from('price_grid')
        .select('total_claimed_pct')
        .eq('id', item.id)
        .single()

      const currentPct = cell?.total_claimed_pct ?? 0
      const addedPct   = Math.round((item.amount / item.fullValue) * 100)
      const newPct     = Math.max(0, currentPct - addedPct)
      const newColor   = newPct >= 100 ? 'blue' : newPct > 0 ? 'orange' : 'white'

      await supabase
        .from('price_grid')
        .update({ total_claimed_pct: newPct, cell_color: newColor })
        .eq('id', item.id)
    }

    // ── Update claim to rejected ───────────────────────────────────────
    await supabase
      .from('claim_periods')
      .update({
        status:           'rejected',
        rejection_reason: reason,
        rejected_at:      new Date().toISOString(),
      })
      .eq('id', claimId)

    // ── SMS foreman with rejection reason ──────────────────────────────
    const foreman = claim.workers as {
      first_name: string
      surname: string
      phone: string | null
      email: string | null
    } | null

    let smsSent = false
    const smsConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_MESSAGING_SERVICE_SID
    )

    if (foreman?.phone && smsConfigured) {
      try {
        const twilio = (await import('twilio')).default
        const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
        await client.messages.create({
          from: process.env.TWILIO_MESSAGING_SERVICE_SID!,
          to:   foreman.phone,
          body: `Glyn Jenkins: Your claim has been rejected. Reason: ${reason}. Please contact the office.`,
        })
        smsSent = true
      } catch {
        smsSent = false
      }
    }

    // ── Email foreman (if Resend configured) ───────────────────────────
    let emailSent   = false
    let emailError: string | null = null
    const emailConfigured = !!process.env.RESEND_API_KEY

    if (foreman?.email && emailConfigured) {
      const { Resend } = await import('resend')
      const resend     = new Resend(process.env.RESEND_API_KEY)
      const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

      const fmtDate = (d: string | null) =>
        d
          ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })
          : '—'

      const periodLabel =
        claim.period_start && claim.period_end
          ? `${fmtDate(claim.period_start)} – ${fmtDate(claim.period_end)}`
          : 'this fortnight'

      const poolTotal = claim.pool_total ?? 0
      const fmtGBP = (n: number) =>
        '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

      const safeReason = reason
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      const html = `
        <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
        <body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
          <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;
                      overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <div style="background:#0f172a;padding:28px 28px 20px;">
              <p style="color:#fb923c;font-size:11px;font-weight:700;letter-spacing:2px;
                         text-transform:uppercase;margin:0 0 6px;">Glyn Jenkins LTD</p>
              <h1 style="color:#fff;font-size:20px;margin:0;">Claim Rejected</h1>
            </div>
            <div style="padding:24px 28px;">
              <p style="color:#475569;font-size:14px;margin:0 0 16px;">
                Hi ${foreman.first_name}, your fortnightly claim has been rejected and needs to be corrected
                before resubmitting.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <tr style="background:#f8fafc;">
                  <td style="padding:10px 12px;font-size:13px;color:#64748b;">Period</td>
                  <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:right;">${periodLabel}</td>
                </tr>
                ${claim.siteName ? `
                <tr>
                  <td style="padding:10px 12px;font-size:13px;color:#64748b;">Site</td>
                  <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:right;">${claim.siteName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
                </tr>` : ''}
                <tr style="background:#f8fafc;">
                  <td style="padding:10px 12px;font-size:13px;color:#64748b;">Claim total</td>
                  <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:right;">${fmtGBP(poolTotal)}</td>
                </tr>
              </table>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:16px;">
                <p style="color:#991b1b;font-size:12px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Reason</p>
                <p style="color:#7f1d1d;font-size:14px;margin:0;line-height:1.5;">${safeReason}</p>
              </div>
              <p style="color:#475569;font-size:13px;margin:0;line-height:1.5;">
                You can amend your claim and submit again while the booking window (or grace period) is still open.
                Contact the office if you need help.
              </p>
              <p style="color:#94a3b8;font-size:11px;margin:20px 0 0;text-align:center;">
                Glyn Jenkins LTD &bull; Automated claim notification
              </p>
            </div>
          </div>
        </body></html>`

      const { error: sendError } = await resend.emails.send({
        from:    `Glyn Jenkins LTD <${fromEmail}>`,
        to:      foreman.email,
        subject: `Claim rejected — ${periodLabel}`,
        html,
      })

      if (sendError) emailError = sendError.message
      else emailSent = true
    }

    return NextResponse.json({
      success: true,
      notifications: {
        emailSent,
        smsSent,
        emailTo:         foreman?.email ?? null,
        emailConfigured,
        smsConfigured,
        emailError,
        noEmailOnFile:   !foreman?.email,
        noPhoneOnFile:   !foreman?.phone,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

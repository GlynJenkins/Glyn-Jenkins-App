import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { email } = await request.json() as { email: string }
    if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 })

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured.' }, { status: 500 })
    }

    const { Resend } = await import('resend')
    const resend    = new Resend(process.env.RESEND_API_KEY)
    const from      = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

    const fmtGBP = (n: number) =>
      '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const gross       = 1500.00
    const adminFee    = 6.00
    const insFee      = 3.00
    const cisTax      = Math.round((gross - adminFee - insFee) * 0.20 * 100) / 100
    const net         = Math.round((gross - adminFee - insFee - cisTax) * 100) / 100

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
              Hi John, your fortnightly pay has been approved and processed.
            </p>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#f8fafc;">
                <td style="padding:10px 12px;font-size:13px;color:#64748b;">Gross Pay</td>
                <td style="padding:10px 12px;font-size:13px;font-weight:600;
                           color:#1e293b;text-align:right;">${fmtGBP(gross)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-size:13px;color:#64748b;">Admin Fee</td>
                <td style="padding:10px 12px;font-size:13px;color:#1e293b;
                           text-align:right;">-${fmtGBP(adminFee)}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="padding:10px 12px;font-size:13px;color:#64748b;">Insurance Fee</td>
                <td style="padding:10px 12px;font-size:13px;color:#1e293b;
                           text-align:right;">-${fmtGBP(insFee)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-size:13px;color:#3b82f6;">CIS Tax (20%)</td>
                <td style="padding:10px 12px;font-size:13px;color:#3b82f6;
                           text-align:right;">-${fmtGBP(cisTax)}</td>
              </tr>
              <tr style="background:#0f172a;">
                <td style="padding:14px 12px;font-size:15px;font-weight:700;color:#fff;">NET PAY</td>
                <td style="padding:14px 12px;font-size:15px;font-weight:700;
                           color:#fb923c;text-align:right;">${fmtGBP(net)}</td>
              </tr>
            </table>
            <p style="color:#94a3b8;font-size:11px;margin:20px 0 0;text-align:center;">
              Glyn Jenkins LTD &bull; This is an automated payslip notification.<br/>
              Keep this email for your HMRC records.
            </p>
          </div>
        </div>
      </body></html>`

    const { data, error } = await resend.emails.send({
      from,
      to:      email,
      subject: `Pay Notification — ${fmtGBP(net)} Net Pay`,
      html,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

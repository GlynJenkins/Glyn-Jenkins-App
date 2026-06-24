import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { phone } = await request.json() as { phone: string }
    if (!phone) return NextResponse.json({ error: 'Phone required.' }, { status: 400 })

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_MESSAGING_SERVICE_SID) {
      return NextResponse.json({ error: 'Twilio credentials not configured.' }, { status: 500 })
    }

    const twilio = (await import('twilio')).default
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

    const msg =
      `Glyn Jenkins: Pay approved.\n` +
      `Gross: £1,500.00\n` +
      `Admin Fee: -£6.00\n` +
      `Insurance: -£3.00\n` +
      `CIS Tax: -£298.20\n` +
      `NET PAY: £1,192.80`

    const message = await client.messages.create({
      from: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to:   phone,
      body: msg,
    })

    return NextResponse.json({ success: true, sid: message.sid })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

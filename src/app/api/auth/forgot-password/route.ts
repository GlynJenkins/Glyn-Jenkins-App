import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function redirectUrlError(redirectTo: string) {
  return NextResponse.json({
    error: `Password reset is not configured. In Supabase → Authentication → URL Configuration → Redirect URLs, add: ${redirectTo}`,
  }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; origin?: string }
    const email  = body.email?.trim().toLowerCase()
    const origin = body.origin?.replace(/\/$/, '')

    if (!email || !origin) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const redirectTo = `${origin}/auth/confirm`
    const supabase    = createServiceClient()

    // Prefer Resend (same as payslips) — avoids Supabase built-in email limits / SMTP issues
    if (process.env.RESEND_API_KEY) {
      const { data, error } = await supabase.auth.admin.generateLink({
        type:    'recovery',
        email,
        options: { redirectTo },
      })

      if (error) {
        // Don't reveal whether the email exists
        if (
          error.message.toLowerCase().includes('user not found') ||
          error.message.toLowerCase().includes('not found')
        ) {
          return NextResponse.json({ success: true })
        }
        console.error('[forgot-password] generateLink:', error.message)
        if (error.message.toLowerCase().includes('redirect')) {
          return redirectUrlError(redirectTo)
        }
        return NextResponse.json(
          { error: 'Could not create reset link. Please try again or contact the office.' },
          { status: 500 }
        )
      }

      const actionLink = data.properties?.action_link
      if (!actionLink) {
        return NextResponse.json({ success: true })
      }

      const { Resend } = await import('resend')
      const resend    = new Resend(process.env.RESEND_API_KEY)
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

      const { error: sendError } = await resend.emails.send({
        from:    fromEmail,
        to:      email,
        subject: 'Reset your Glyn Jenkins portal password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
            <p style="color:#ea580c;font-size:11px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 style="font-size:20px;margin:0 0 16px">Reset your password</h1>
            <p style="font-size:14px;line-height:1.6;color:#475569">
              Click the button below to choose a new password for the foreman / management portal.
              This link expires after a short time.
            </p>
            <p style="margin:24px 0">
              <a href="${actionLink}"
                 style="display:inline-block;background:#ea580c;color:#fff;padding:12px 24px;
                        border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">
                Reset password
              </a>
            </p>
            <p style="font-size:12px;color:#94a3b8">
              If you didn't request this, you can ignore this email.
            </p>
          </div>
        `,
      })

      if (sendError) {
        console.error('[forgot-password] Resend:', sendError.message)
        return NextResponse.json(
          { error: 'Could not send reset email. Please try again or contact the office.' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    }

    // Fallback: Supabase built-in email (rate-limited on free tier)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (resetError) {
      console.error('[forgot-password] resetPasswordForEmail:', resetError.message)

      if (resetError.message.toLowerCase().includes('redirect')) {
        return redirectUrlError(redirectTo)
      }
      if (resetError.message.toLowerCase().includes('rate limit')) {
        return NextResponse.json(
          { error: 'Too many reset attempts. Wait a few minutes and try again.' },
          { status: 429 }
        )
      }

      return NextResponse.json(
        { error: 'Could not send reset email. Check Supabase email settings or contact the office.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[forgot-password]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

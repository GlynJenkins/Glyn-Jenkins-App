import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'

export type SiteAuditSendTarget = {
  workerId: string
  name:     string
  email:    string | null
  phone:    string | null
}

export type SiteAuditSendResult = {
  workerId:   string
  workerName: string
  sentVia:    string
  status:     'sent' | 'failed'
  error?:     string
}

const ATTACH_MAX_BYTES = 8 * 1024 * 1024

function fromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || 'payroll@glynjenkins.co.uk'
}

async function sendSms(phone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_MESSAGING_SERVICE_SID
  ) {
    return { ok: false, error: 'SMS not configured.' }
  }
  try {
    const twilio = (await import('twilio')).default
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    )
    await client.messages.create({
      from: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to:   phone,
      body,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SMS failed.' }
  }
}

/** Email (PDF attach or signed link) + optional SMS. Never throws — results per recipient. */
export async function issueSiteAuditToRecipients(opts: {
  auditId:     string
  siteName:    string
  pdfBuffer:   Buffer
  pdfFilename: string
  pdfPath:     string
  targets:     SiteAuditSendTarget[]
}): Promise<SiteAuditSendResult[]> {
  const supabase = createServiceClient()
  const results: SiteAuditSendResult[] = []
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const resend = resendKey ? new Resend(resendKey) : null

  let signedUrl: string | null = null
  if (opts.pdfBuffer.length > ATTACH_MAX_BYTES) {
    const { data } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(opts.pdfPath, 60 * 60 * 24 * 7)
    signedUrl = data?.signedUrl ?? null
  }

  const smsBody = `New site audit for ${opts.siteName} — check your foreman portal.`

  for (const target of opts.targets) {
    const channels: string[] = []
    const errors: string[] = []

    if (target.email && resend) {
      try {
        const html = `
          <p>Hello ${target.name},</p>
          <p>A new <strong>Site Audit Report</strong> is ready for <strong>${opts.siteName}</strong>.</p>
          <p>You can also open it in the foreman portal under Site Audits.</p>
          ${signedUrl ? `<p><a href="${signedUrl}">Download the PDF</a> (link valid for 7 days).</p>` : ''}
          <p>— Glyn Jenkins Ltd</p>
        `
        await resend.emails.send({
          from:    `Glyn Jenkins LTD <${fromEmail()}>`,
          to:      target.email,
          subject: `Site Audit — ${opts.siteName}`,
          html,
          ...(signedUrl
            ? {}
            : {
                attachments: [{
                  filename: opts.pdfFilename,
                  content:  opts.pdfBuffer.toString('base64'),
                }],
              }),
        })
        channels.push('email')
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Email failed.')
      }
    } else if (target.email && !resend) {
      errors.push('Email not configured.')
    }

    if (target.phone) {
      const sms = await sendSms(target.phone, smsBody)
      if (sms.ok) channels.push('sms')
      else if (sms.error && sms.error !== 'SMS not configured.') errors.push(sms.error)
    }

    const status: 'sent' | 'failed' = channels.length > 0 ? 'sent' : 'failed'
    const sentVia = channels.length > 0 ? channels.join(',') : 'none'
    const errorMessage = status === 'failed'
      ? (errors.join(' ') || 'No email or phone on file.')
      : (errors.length ? errors.join(' ') : null)

    await supabase.from('site_audit_recipients').insert({
      audit_id:        opts.auditId,
      worker_id:       target.workerId,
      worker_name:     target.name,
      sent_via:        sentVia,
      delivery_status: status,
      error_message:   errorMessage,
    })

    results.push({
      workerId:   target.workerId,
      workerName: target.name,
      sentVia,
      status,
      error: errorMessage ?? undefined,
    })
  }

  return results
}

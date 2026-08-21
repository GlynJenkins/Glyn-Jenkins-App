/**
 * Resend "from" address for outbound mail.
 * Returns null when unset or still on Resend's sandbox sender — callers should
 * skip send and warn, rather than failing silently to workers.
 */
export function getResendFromEmail(): string | null {
  const raw = process.env.RESEND_FROM_EMAIL?.trim()
  if (!raw) return null
  if (/@resend\.dev$/i.test(raw) || raw.toLowerCase() === 'onboarding@resend.dev') {
    return null
  }
  return raw
}

export function resendFromConfigured(): boolean {
  return getResendFromEmail() != null
}

import { NextResponse } from 'next/server'

function summarizeError(err: unknown): string {
  if (err == null) return 'unknown error'
  if (typeof err === 'string') return err.slice(0, 200)
  if (err instanceof Error) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : undefined
    return code ? `${err.name}: ${err.message} [${code}]` : `${err.name}: ${err.message}`
  }
  if (typeof err === 'object') {
    const o = err as { code?: unknown; message?: unknown; details?: unknown }
    const parts = [
      o.code != null ? `code=${String(o.code)}` : null,
      o.message != null ? String(o.message) : null,
    ].filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  return 'non-Error throw'
}

/**
 * Log a safe summary server-side and return a generic message to the client.
 * Avoid dumping full PostgREST/SQL objects (can include row snippets).
 */
export function apiError(
  context: string,
  err: unknown,
  message = 'Something went wrong. Please try again.',
  status = 500,
): NextResponse {
  console.error(`[${context}]`, summarizeError(err))
  return NextResponse.json({ error: message }, { status })
}

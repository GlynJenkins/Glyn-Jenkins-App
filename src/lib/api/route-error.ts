import { NextResponse } from 'next/server'

/**
 * Log the real error server-side and return a generic message to the client.
 * Database/internal error details (table names, constraint names, SQL hints)
 * must never reach the browser.
 */
export function apiError(
  context: string,
  err: unknown,
  message = 'Something went wrong. Please try again.',
  status = 500,
): NextResponse {
  console.error(`[${context}]`, err)
  return NextResponse.json({ error: message }, { status })
}

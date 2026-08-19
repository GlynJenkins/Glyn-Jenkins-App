import { NextResponse } from 'next/server'

/** Draft or completed audits can be edited; completed edits regenerate the PDF. */
export function assertAuditEditable(status: string): NextResponse | null {
  if (status === 'draft' || status === 'completed') return null
  return NextResponse.json({ error: 'This audit cannot be edited.' }, { status: 400 })
}

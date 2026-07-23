import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED_COLORS = ['white', 'orange', 'blue', 'green']
const MAX_MONEY = 1_000_000
const MAX_NOTE_LENGTH = 500

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { cellId } = await params
    const body = await request.json() as Record<string, unknown>

    // Explicit whitelist — never spread the raw body into the update.
    const update: Record<string, unknown> = {}

    if ('contract_value' in body) {
      const v = body.contract_value
      if (v !== null && (!isFiniteNumber(v) || v < 0 || v > MAX_MONEY)) {
        return NextResponse.json({ error: 'Invalid contract value.' }, { status: 400 })
      }
      update.contract_value = v
    }

    if ('current_balance' in body) {
      const v = body.current_balance
      if (v !== null && (!isFiniteNumber(v) || v < 0 || v > MAX_MONEY)) {
        return NextResponse.json({ error: 'Invalid balance value.' }, { status: 400 })
      }
      update.current_balance = v
    }

    if ('total_claimed_pct' in body) {
      const v = body.total_claimed_pct
      if (!isFiniteNumber(v) || v < 0 || v > 100) {
        return NextResponse.json({ error: 'Claimed percentage must be between 0 and 100.' }, { status: 400 })
      }
      update.total_claimed_pct = v
    }

    if ('cell_color' in body) {
      const v = body.cell_color
      if (typeof v !== 'string' || !ALLOWED_COLORS.includes(v)) {
        return NextResponse.json({ error: 'Invalid cell colour.' }, { status: 400 })
      }
      update.cell_color = v
    }

    if ('override_note' in body) {
      const v = body.override_note
      if (v !== null && (typeof v !== 'string' || v.length > MAX_NOTE_LENGTH)) {
        return NextResponse.json({ error: 'Invalid note.' }, { status: 400 })
      }
      update.override_note = v
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('price_grid')
      .update(update)
      .eq('id', cellId)
      .select('id')

    if (error) {
      console.error('Cell update failed:', error)
      return NextResponse.json({ error: 'Failed to update cell.' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Cell not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Cell update error:', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

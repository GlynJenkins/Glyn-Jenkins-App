import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { cellId } = await params
    const body = await request.json() as {
      contract_value?:    number | null
      current_balance?:   number | null
      cell_color?:        string
      override_note?:     string | null
      total_claimed_pct?: number
    }

    const allowedColors = ['white', 'orange', 'blue', 'green']
    if (body.cell_color && !allowedColors.includes(body.cell_color)) {
      return NextResponse.json({ error: 'Invalid cell colour.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('price_grid')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cellId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

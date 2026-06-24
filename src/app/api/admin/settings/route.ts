import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('admin_settings')
    .select('id, global_admin_fee, insurance_fee, holiday_day_rate, college_day_rate, pay_cycle_period_start, pay_cycle_pay_day, updated_at')
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? {
    global_admin_fee:       6,
    insurance_fee:          3,
    holiday_day_rate:       50,
    college_day_rate:       50,
    pay_cycle_period_start: '2025-06-15',
    pay_cycle_pay_day:      '2025-07-03',
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as {
      global_admin_fee:       number
      insurance_fee:          number
      holiday_day_rate:       number
      college_day_rate:       number
      pay_cycle_period_start?: string
      pay_cycle_pay_day?:      string
    }

    const {
      global_admin_fee, insurance_fee, holiday_day_rate, college_day_rate,
      pay_cycle_period_start, pay_cycle_pay_day,
    } = body

    for (const [key, val] of Object.entries({ global_admin_fee, insurance_fee, holiday_day_rate, college_day_rate })) {
      if (typeof val !== 'number' || val < 0) {
        return NextResponse.json({ error: `Invalid value for ${key}.` }, { status: 400 })
      }
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (pay_cycle_period_start && !dateRe.test(pay_cycle_period_start)) {
      return NextResponse.json({ error: 'Invalid booking window start date.' }, { status: 400 })
    }
    if (pay_cycle_pay_day && !dateRe.test(pay_cycle_pay_day)) {
      return NextResponse.json({ error: 'Invalid pay day date.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const updatePayload: Record<string, unknown> = {
      global_admin_fee,
      insurance_fee,
      holiday_day_rate,
      college_day_rate,
      updated_at: new Date().toISOString(),
    }
    if (pay_cycle_period_start) updatePayload.pay_cycle_period_start = pay_cycle_period_start
    if (pay_cycle_pay_day)      updatePayload.pay_cycle_pay_day      = pay_cycle_pay_day

    const { data: existing } = await supabase
      .from('admin_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    let error
    if (existing?.id) {
      ;({ error } = await supabase
        .from('admin_settings')
        .update(updatePayload)
        .eq('id', existing.id))
    } else {
      ;({ error } = await supabase
        .from('admin_settings')
        .insert(updatePayload))
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { validateHolidayRequest } from '@/lib/holidays/queries'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  if (!auth.worker) {
    return NextResponse.json({ error: 'Sign in with a staff account to request holiday.' }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      startDate?: string
      endDate?: string
      note?: string
    }

    const startDate = body.startDate?.trim()
    const endDate = body.endDate?.trim() ?? startDate
    const note = body.note?.trim() || null

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })
    }

    if (!['admin', 'management'].includes(auth.worker.role)) {
      return NextResponse.json({ error: 'Holiday requests are for admin/management staff.' }, { status: 403 })
    }

    const validation = await validateHolidayRequest({
      workerId: auth.worker.id,
      startDate,
      endDate,
    })
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, conflicts: validation.conflicts },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('management_holiday_requests')
      .insert({
        worker_id:      auth.worker.id,
        start_date:     startDate,
        end_date:       endDate,
        days_requested: validation.days,
        status:         'pending',
        note,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, requestId: data.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

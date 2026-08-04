import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { canAccessManagementArea } from '@/lib/worker-access'
import { createServiceClient } from '@/lib/supabase/server'
import { validateHolidayRequest } from '@/lib/holidays/queries'

export async function POST(request: NextRequest) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  if (!auth.worker) {
    return NextResponse.json({ error: 'Sign in with a staff account to request holiday.' }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      startDate?: string
      endDate?: string
      note?: string
      workerId?: string
    }

    const startDate = body.startDate?.trim()
    const endDate = body.endDate?.trim() ?? startDate
    const note = body.note?.trim() || null

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })
    }

    if (!canAccessManagementArea(auth.worker.role)) {
      return NextResponse.json({ error: 'Holiday requests are for management staff.' }, { status: 403 })
    }

    // Always request leave for the logged-in user — never trust a body workerId.
    const workerId = auth.worker.id

    const validation = await validateHolidayRequest({
      workerId,
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
        worker_id:      workerId,
        start_date:     startDate,
        end_date:       endDate,
        days_requested: validation.days,
        status:         'pending',
        note,
      })
      .select('id')
      .single()

    if (error) return apiError("api/admin/holidays/requests", error)

    return NextResponse.json({ success: true, requestId: data.id })
  } catch (err) {
    return apiError("api/admin/holidays/requests", err)
  }
}

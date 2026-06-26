import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { findHolidayConflicts, validateHolidayRequest } from '@/lib/holidays/queries'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  if (auth.worker && auth.worker.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can approve holiday requests.' }, { status: 403 })
  }

  try {
    const { requestId } = await params
    const body = await request.json() as {
      status?: 'approved' | 'rejected'
      adminNote?: string
    }

    if (body.status !== 'approved' && body.status !== 'rejected') {
      return NextResponse.json({ error: 'Status must be approved or rejected.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('management_holiday_requests')
      .select('id, worker_id, start_date, end_date, status')
      .eq('id', requestId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Request has already been reviewed.' }, { status: 400 })
    }

    if (body.status === 'approved') {
      const validation = await validateHolidayRequest({
        workerId: existing.worker_id,
        startDate: existing.start_date,
        endDate: existing.end_date,
        excludeRequestId: requestId,
      })
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error, conflicts: validation.conflicts },
          { status: 400 }
        )
      }

      const conflicts = await findHolidayConflicts(
        existing.worker_id,
        existing.start_date,
        existing.end_date,
        requestId
      )
      const approvedClash = conflicts.find((c) => c.status === 'approved')
      if (approvedClash) {
        return NextResponse.json(
          { error: `Cannot approve — ${approvedClash.worker_name} is already off those dates.` },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase
      .from('management_holiday_requests')
      .update({
        status:      body.status,
        admin_note:  body.adminNote?.trim() || null,
        reviewed_by: auth.worker?.id ?? null,
        reviewed_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { requestId } = await params
    const supabase = createServiceClient()

    const { data: existing } = await supabase
      .from('management_holiday_requests')
      .select('id, worker_id, status')
      .eq('id', requestId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    }

    const isAdmin = !auth.worker || auth.worker.role === 'admin'
    const isOwner = auth.worker?.id === existing.worker_id

    if (!isAdmin && !(isOwner && existing.status === 'pending')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('management_holiday_requests')
      .delete()
      .eq('id', requestId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

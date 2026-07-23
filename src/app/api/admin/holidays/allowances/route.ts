import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { currentHolidayYear } from '@/lib/holidays/management'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  if (auth.worker && auth.worker.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can change holiday allowances.' }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      workerId?: string
      year?: number
      allocatedDays?: number
    }

    const workerId = body.workerId
    const year = body.year ?? currentHolidayYear()
    const allocatedDays = body.allocatedDays

    if (!workerId || allocatedDays == null || allocatedDays < 0) {
      return NextResponse.json({ error: 'Worker and allocated days are required.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: worker } = await supabase
      .from('workers')
      .select('id, role')
      .eq('id', workerId)
      .maybeSingle()

    if (!worker || !['admin', 'management'].includes(worker.role)) {
      return NextResponse.json({ error: 'Allowances apply to admin/management only.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('management_holiday_allowances')
      .upsert(
        {
          worker_id:      workerId,
          year,
          allocated_days: allocatedDays,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'worker_id,year' }
      )

    if (error) return apiError("api/admin/holidays/allowances", error)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/admin/holidays/allowances", err)
  }
}

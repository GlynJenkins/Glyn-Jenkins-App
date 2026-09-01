import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json() as {
      status: string
      rightToWorkOverride?: boolean
      overrideNote?: string
    }
    const { status } = body

    const allowed = ['active', 'inactive', 'pending_verification']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const now = new Date().toISOString()

    if (status === 'active') {
      const { data: worker, error: fetchError } = await supabase
        .from('workers')
        .select('id, right_to_work_status')
        .eq('id', id)
        .maybeSingle()

      if (fetchError && !/right_to_work/i.test(fetchError.message) && fetchError.code !== 'PGRST204') {
        return apiError('api/workers/[id]/status', fetchError)
      }

      // If RTW columns exist and status is not verified, require override.
      if (worker && 'right_to_work_status' in worker) {
        const rtw = worker.right_to_work_status as string | null
        if (rtw && rtw !== 'verified') {
          if (!body.rightToWorkOverride) {
            return NextResponse.json(
              {
                error: 'Verify right to work before activating.',
                code: 'RIGHT_TO_WORK_REQUIRED',
              },
              { status: 403 },
            )
          }

          const overrideBy = auth.worker
            ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
            : (auth.user.email ?? 'Admin')
          const overrideNote =
            typeof body.overrideNote === 'string'
              ? body.overrideNote.trim().slice(0, 500)
              : ''

          const { error: overrideError } = await supabase
            .from('workers')
            .update({
              status: 'active',
              right_to_work_override_at: now,
              right_to_work_override_by: overrideBy,
              right_to_work_override_note: overrideNote || 'Activated without RTW verification',
              updated_at: now,
            })
            .eq('id', id)

          if (overrideError) {
            // Override columns may be missing — still allow activate if user insisted,
            // but prefer failing clearly when RTW exists without override columns.
            if (/right_to_work_override/i.test(overrideError.message) || overrideError.code === 'PGRST204') {
              const { error } = await supabase
                .from('workers')
                .update({ status: 'active', updated_at: now })
                .eq('id', id)
              if (error) return apiError('api/workers/[id]/status', error)
              return NextResponse.json({ success: true, overridden: true, overrideLogged: false })
            }
            return apiError('api/workers/[id]/status', overrideError)
          }

          return NextResponse.json({ success: true, overridden: true, overrideLogged: true })
        }
      }
    }

    const { error } = await supabase
      .from('workers')
      .update({ status, updated_at: now })
      .eq('id', id)

    if (error) {
      return apiError('api/workers/[id]/status', error)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/workers/[id]/status', err)
  }
}

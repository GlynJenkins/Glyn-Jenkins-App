import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  isRightToWorkType,
  type RightToWorkType,
} from '@/lib/induction/right-to-work'

export const dynamic = 'force-dynamic'

function actorName(
  worker: { first_name: string; surname: string } | null,
  userEmail: string | undefined,
): string {
  if (worker) {
    const name = `${worker.first_name} ${worker.surname}`.trim()
    if (name) return name
  }
  return userEmail?.trim() || 'Admin'
}

/** Mark right-to-work as verified (admin/management only). Also appends check log. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const body = (await request.json().catch(() => ({}))) as {
      note?: string
      rightToWorkType?: string
      rightToWorkExpiry?: string
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''

    if (!isRightToWorkType(body.rightToWorkType)) {
      return NextResponse.json(
        { error: 'Select continuous or time-limited right to work.' },
        { status: 400 },
      )
    }
    const rightToWorkType: RightToWorkType = body.rightToWorkType

    let rightToWorkExpiry: string | null = null
    if (rightToWorkType === 'time_limited') {
      const raw = typeof body.rightToWorkExpiry === 'string'
        ? body.rightToWorkExpiry.trim().slice(0, 10)
        : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return NextResponse.json(
          { error: 'Enter the permission end date for time-limited right to work.' },
          { status: 400 },
        )
      }
      rightToWorkExpiry = raw
    }

    const supabase = createServiceClient()
    const { data: existing, error: fetchError } = await supabase
      .from('workers')
      .select(`
        id, right_to_work_status, right_to_work_method,
        right_to_work_document_url, id_document_url
      `)
      .eq('id', workerId)
      .maybeSingle()

    if (fetchError) {
      if (/right_to_work/i.test(fetchError.message) || fetchError.code === 'PGRST204') {
        return NextResponse.json(
          { error: 'Right to work columns are missing. Run the SQL migration first.' },
          { status: 503 },
        )
      }
      return apiError('api/admin/workers/[workerId]/right-to-work', fetchError)
    }

    if (!existing) {
      return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const verifiedBy = actorName(auth.worker, auth.user.email)
    const documentUrl =
      existing.right_to_work_document_url || existing.id_document_url || null

    const { error: updateError } = await supabase
      .from('workers')
      .update({
        right_to_work_status: 'verified',
        right_to_work_verified_at: now,
        right_to_work_verified_by: verifiedBy,
        right_to_work_note: note || null,
        right_to_work_type: rightToWorkType,
        right_to_work_expiry: rightToWorkExpiry,
        updated_at: now,
      })
      .eq('id', workerId)

    if (updateError) {
      if (/right_to_work/i.test(updateError.message) || updateError.code === 'PGRST204') {
        return NextResponse.json(
          { error: 'Right to work columns are missing. Run the SQL migration first.' },
          { status: 503 },
        )
      }
      return apiError('api/admin/workers/[workerId]/right-to-work', updateError)
    }

    // Permanent audit trail — ignore if table missing so verify still succeeds.
    const { error: logError } = await supabase.from('right_to_work_checks').insert({
      worker_id: workerId,
      checked_by: verifiedBy,
      checked_at: now,
      method: existing.right_to_work_method ?? null,
      outcome: 'verified',
      note: note || null,
      document_url: documentUrl,
    })
    if (logError) {
      console.warn(
        '[right-to-work] check log insert failed — run add_right_to_work_register.sql:',
        logError.message,
      )
    }

    return NextResponse.json({
      success: true,
      right_to_work_status: 'verified',
      right_to_work_verified_at: now,
      right_to_work_verified_by: verifiedBy,
      right_to_work_note: note || null,
      right_to_work_type: rightToWorkType,
      right_to_work_expiry: rightToWorkExpiry,
      checkLogged: !logError,
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/right-to-work', err)
  }
}

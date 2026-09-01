import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

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

/** Mark right-to-work as verified (admin/management only). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const body = (await request.json().catch(() => ({}))) as { note?: string }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''

    const supabase = createServiceClient()
    const { data: existing, error: fetchError } = await supabase
      .from('workers')
      .select('id, right_to_work_status')
      .eq('id', workerId)
      .maybeSingle()

    if (fetchError) {
      // Migration not applied yet — surface a clear message.
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

    const { error: updateError } = await supabase
      .from('workers')
      .update({
        right_to_work_status: 'verified',
        right_to_work_verified_at: now,
        right_to_work_verified_by: verifiedBy,
        right_to_work_note: note || null,
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

    return NextResponse.json({
      success: true,
      right_to_work_status: 'verified',
      right_to_work_verified_at: now,
      right_to_work_verified_by: verifiedBy,
      right_to_work_note: note || null,
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/right-to-work', err)
  }
}

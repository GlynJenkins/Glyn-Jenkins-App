import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { decodePngDataUrl } from '@/lib/toolbox-talks/helpers'

export const dynamic = 'force-dynamic'

const MAX_SIG_BYTES = 1 * 1024 * 1024

type Params = { params: Promise<{ talkId: string }> }

/** Save one attendee or manager signature (PNG data URL). */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { talkId } = await params
    const body = await request.json() as {
      attendeeId?: string
      dataUrl?: string
    }

    const target = body.attendeeId?.trim()
    const dataUrl = body.dataUrl?.trim()
    if (!target || !dataUrl) {
      return NextResponse.json({ error: 'attendeeId and dataUrl are required.' }, { status: 400 })
    }

    const png = decodePngDataUrl(dataUrl)
    if (!png) {
      return NextResponse.json({ error: 'Signature must be a PNG image.' }, { status: 400 })
    }
    if (png.length > MAX_SIG_BYTES) {
      return NextResponse.json({ error: 'Signature image is too large.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: talk } = await supabase
      .from('toolbox_talks')
      .select('id, status')
      .eq('id', talkId)
      .maybeSingle()

    if (!talk) {
      return NextResponse.json({ error: 'Talk not found.' }, { status: 404 })
    }
    if (talk.status === 'completed') {
      return NextResponse.json({ error: 'This talk is already completed.' }, { status: 400 })
    }

    const signedAt = new Date().toISOString()

    if (target === 'manager') {
      const path = `toolbox-talks/${talkId}/manager.png`
      const { error: upError } = await supabase.storage
        .from('worker-documents')
        .upload(path, png, { contentType: 'image/png', upsert: true })

      if (upError) {
        return apiError('api/admin/toolbox-talks/[talkId]/signature manager', upError, 'Could not save signature.')
      }

      const { error: updError } = await supabase
        .from('toolbox_talks')
        .update({ manager_signature_path: path })
        .eq('id', talkId)

      if (updError) {
        return apiError('api/admin/toolbox-talks/[talkId]/signature manager upd', updError, 'Could not save signature.')
      }

      return NextResponse.json({ ok: true, target: 'manager', signedAt, path })
    }

    const { data: attendee } = await supabase
      .from('toolbox_talk_attendees')
      .select('id, talk_id')
      .eq('id', target)
      .eq('talk_id', talkId)
      .maybeSingle()

    if (!attendee) {
      return NextResponse.json({ error: 'Attendee not found on this talk.' }, { status: 404 })
    }

    const path = `toolbox-talks/${talkId}/sig-${attendee.id}.png`
    const { error: upError } = await supabase.storage
      .from('worker-documents')
      .upload(path, png, { contentType: 'image/png', upsert: true })

    if (upError) {
      return apiError('api/admin/toolbox-talks/[talkId]/signature attendee', upError, 'Could not save signature.')
    }

    const { error: updError } = await supabase
      .from('toolbox_talk_attendees')
      .update({ signature_path: path, signed_at: signedAt })
      .eq('id', attendee.id)

    if (updError) {
      return apiError('api/admin/toolbox-talks/[talkId]/signature attendee upd', updError, 'Could not save signature.')
    }

    return NextResponse.json({ ok: true, target: attendee.id, signedAt, path })
  } catch (err) {
    return apiError('api/admin/toolbox-talks/[talkId]/signature', err)
  }
}

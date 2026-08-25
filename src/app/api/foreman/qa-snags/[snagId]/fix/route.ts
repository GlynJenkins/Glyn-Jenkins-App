import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { isImageUploadFile, photoExtension } from '@/lib/qa/inspection-photos'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import { refreshInspectionStateFromSnags } from '@/lib/qa/snags'
import { qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PHOTO_BYTES = 20 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ snagId: string }> },
) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { snagId } = await params
    const formData = await request.formData()
    const note = ((formData.get('note') as string) ?? '').trim()
    const photo = formData.get('photo') as File | null

    const supabase = createServiceClient()
    const { data: snag, error: snagErr } = await supabase
      .from('qa_inspection_snags')
      .select('*, qa_plot_inspections ( id, site_id, plot_number, stage, inspection_state, status )')
      .eq('id', snagId)
      .maybeSingle()

    if (snagErr || !snag) {
      return NextResponse.json({ error: 'Snag not found.' }, { status: 404 })
    }

    const inspection = Array.isArray(snag.qa_plot_inspections)
      ? snag.qa_plot_inspections[0]
      : snag.qa_plot_inspections

    if (!inspection || inspection.status !== 'completed') {
      return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
    }

    const { data: assignment } = await supabase
      .from('foreman_site_assignments')
      .select('site_id')
      .eq('foreman_id', auth.worker.id)
      .eq('site_id', inspection.site_id)
      .maybeSingle()

    if (!assignment) {
      return NextResponse.json({ error: 'Site not assigned to you.' }, { status: 403 })
    }

    if (snag.fixed) {
      return NextResponse.json({ error: 'This snag is already marked done.' }, { status: 409 })
    }

    if (inspection.inspection_state !== 'failed_open') {
      return NextResponse.json(
        { error: 'This inspection is not currently with the foreman.' },
        { status: 400 },
      )
    }

    let fixedPhotoPath: string | null = null
    if (photo && isImageUploadFile(photo)) {
      if (photo.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: 'Photo too large (max 20 MB).' }, { status: 400 })
      }
      const raw = Buffer.from(await photo.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      const ext = photoExtension(normalized.mime)
      const ts = Date.now()
      fixedPhotoPath = `qa/${inspection.site_id}/${inspection.plot_number}/${inspection.stage}/${ts}-fix-${snagId.slice(0, 8)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('worker-documents')
        .upload(fixedPhotoPath, normalized.buffer, {
          contentType: normalized.mime,
          upsert: false,
        })
      if (upErr) {
        return NextResponse.json({ error: 'Photo upload failed.' }, { status: 500 })
      }
    }

    const nowIso = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('qa_inspection_snags')
      .update({
        fixed:            true,
        fixed_at:         nowIso,
        fixed_note:       note || null,
        fixed_photo_path: fixedPhotoPath,
        fixed_by:         auth.worker.id,
      })
      .eq('id', snagId)
      .eq('fixed', false)

    if (updErr) {
      return NextResponse.json({ error: 'Could not mark snag done.' }, { status: 500 })
    }

    const nextState = await refreshInspectionStateFromSnags(supabase, inspection.id)

    if (nextState === 'awaiting_reinspection') {
      // Notify management via SMS to site supervisors if we have phones — best effort.
      // Primary signal is the amber badge / admin tile.
      try {
        const { data: managers } = await supabase
          .from('workers')
          .select('phone, role')
          .in('role', ['management', 'contracts_manager', 'site_supervisor', 'admin'])
          .eq('status', 'active')
          .not('phone', 'is', null)
          .limit(8)

        if (
          managers?.length &&
          process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_MESSAGING_SERVICE_SID
        ) {
          const twilio = (await import('twilio')).default
          const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN,
          )
          const body =
            `Plot ${inspection.plot_number} ${qaStageLabel(inspection.stage)} is ready for re-inspection.`
          for (const m of managers) {
            if (!m.phone) continue
            await client.messages.create({
              from: process.env.TWILIO_MESSAGING_SERVICE_SID,
              to:   m.phone,
              body,
            }).catch(() => null)
          }
        }
      } catch {
        // never block
      }
    }

    return NextResponse.json({
      success: true,
      inspectionState: nextState,
    })
  } catch (err) {
    console.error('[foreman/qa-snags/fix]', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

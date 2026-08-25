import { NextRequest, NextResponse } from 'next/server'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import { photoExtension } from '@/lib/qa/inspection-photos'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import {
  fetchSnagsForInspection,
  insertSnags,
  notifySiteForemenSms,
} from '@/lib/qa/snags'
import { qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PHOTO_BYTES = 20 * 1024 * 1024

/**
 * Re-inspect an inspection that is awaiting_reinspection (or failed_open with all fixed).
 * action=pass → green. action=fail → new snag round, back to red.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { inspectionId } = await params
    const formData = await request.formData()
    const action = (formData.get('action') as string)?.trim()
    if (action !== 'pass' && action !== 'fail') {
      return NextResponse.json({ error: 'Action must be pass or fail.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: inspection, error: inspErr } = await supabase
      .from('qa_plot_inspections')
      .select('*')
      .eq('id', inspectionId)
      .eq('status', 'completed')
      .maybeSingle()

    if (inspErr || !inspection) {
      return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
    }

    if (
      inspection.inspection_state !== 'awaiting_reinspection' &&
      inspection.inspection_state !== 'failed_open'
    ) {
      return NextResponse.json(
        { error: 'This inspection is not waiting for re-inspection.' },
        { status: 400 },
      )
    }

    const existingSnags = await fetchSnagsForInspection(supabase, inspectionId)
    const currentRound = existingSnags.reduce((max, s) => Math.max(max, s.round), 0) || 1

    // Archive current completed row before state change.
    const workerId = auth.worker?.id ?? null
    const { error: archiveErr } = await supabase.from('qa_inspection_history').insert({
      inspection_id:  inspection.id,
      site_id:        inspection.site_id,
      plot_number:    inspection.plot_number,
      stage:          inspection.stage,
      status:         inspection.status,
      form_data: {
        ...(inspection.form_data as object ?? {}),
        inspection_state: inspection.inspection_state,
        reinspect_archive: true,
        snags_snapshot: existingSnags,
      },
      notes:          inspection.notes,
      signature_path: inspection.signature_path,
      pdf_path:       inspection.pdf_path,
      inspected_by:   inspection.inspected_by,
      inspected_at:   inspection.inspected_at,
      archived_by:    workerId,
    })
    if (archiveErr) {
      console.error('[QA reinspect] archive failed:', archiveErr)
      return NextResponse.json({ error: 'Could not archive prior inspection.' }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const formDataJson = (inspection.form_data as Record<string, unknown> | null) ?? {}

    if (action === 'pass') {
      const { error: updErr } = await supabase
        .from('qa_plot_inspections')
        .update({
          inspection_state: 'passed',
          form_data: {
            ...formDataJson,
            result: 'Pass',
            reinspect_passed_at: nowIso,
            reinspect_passed_by: workerId,
            reinspect_passed_by_name: auth.worker
              ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
              : null,
          },
          updated_at: nowIso,
        })
        .eq('id', inspectionId)
      if (updErr) {
        return NextResponse.json({ error: 'Failed to mark inspection as passed.' }, { status: 500 })
      }

      const grid = await fetchQaSiteGrid(inspection.site_id)
      return NextResponse.json({ success: true, grid })
    }

    // Fail again — new snag round
    type IncomingSnag = { description: string; photoIndex?: number | null }
    const snagsRaw = formData.get('snags') as string | null
    let incomingSnags: IncomingSnag[] = []
    if (snagsRaw) {
      try {
        const parsed = JSON.parse(snagsRaw) as IncomingSnag[]
        incomingSnags = (Array.isArray(parsed) ? parsed : [])
          .map((s) => ({
            description: typeof s.description === 'string' ? s.description.trim() : '',
            photoIndex:
              typeof s.photoIndex === 'number' && Number.isFinite(s.photoIndex)
                ? s.photoIndex
                : null,
          }))
          .filter((s) => s.description.length > 0)
      } catch {
        return NextResponse.json({ error: 'Invalid snag list.' }, { status: 400 })
      }
    }
    if (incomingSnags.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one snag when failing re-inspection.' },
        { status: 400 },
      )
    }

    const snagPhotoFiles = (formData.getAll('snagPhotos') as unknown[])
      .filter((f): f is File => {
        if (!f || typeof f !== 'object') return false
        const file = f as File
        return typeof file.size === 'number' && file.size > 0 && typeof file.arrayBuffer === 'function'
      })
    const newRound = currentRound + 1
    const ts = Date.now()
    const storedPaths: (string | null)[] = []

    for (let i = 0; i < snagPhotoFiles.length; i++) {
      const file = snagPhotoFiles[i]
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: 'Snag photo too large.' }, { status: 400 })
      }
      const raw = Buffer.from(await file.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      const ext = photoExtension(normalized.mime)
      const path = `qa/${inspection.site_id}/${inspection.plot_number}/${inspection.stage}/${ts}-snag-r${newRound}-${i + 1}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('worker-documents')
        .upload(path, normalized.buffer, { contentType: normalized.mime, upsert: false })
      if (upErr) {
        return NextResponse.json({ error: 'Snag photo upload failed.' }, { status: 500 })
      }
      storedPaths.push(path)
    }

    await insertSnags(
      supabase,
      inspectionId,
      incomingSnags.map((s, i) => ({
        description: s.description,
        raised_photo_path:
          s.photoIndex != null && s.photoIndex >= 0 && s.photoIndex < storedPaths.length
            ? storedPaths[s.photoIndex]
            : null,
        sort_order: i,
      })),
      newRound,
    )

    const { error: failErr } = await supabase
      .from('qa_plot_inspections')
      .update({
        inspection_state: 'failed_open',
        form_data: {
          ...formDataJson,
          result: 'Fail',
          snag_round: newRound,
          reinspect_failed_at: nowIso,
          reinspect_failed_by: workerId,
        },
        updated_at: nowIso,
      })
      .eq('id', inspectionId)

    if (failErr) {
      return NextResponse.json({ error: 'Failed to update inspection state.' }, { status: 500 })
    }

    await notifySiteForemenSms(
      supabase,
      inspection.site_id,
      `Quality re-inspection — Plot ${inspection.plot_number} ${qaStageLabel(inspection.stage)} has ${incomingSnags.length} item${incomingSnags.length === 1 ? '' : 's'} to action.`,
    )

    const grid = await fetchQaSiteGrid(inspection.site_id)
    return NextResponse.json({ success: true, grid })
  } catch (err) {
    console.error('[QA reinspect]', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

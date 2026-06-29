import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import { generateQaInspectionPdf, type QaPdfPhoto } from '@/lib/qa/generate-inspection-pdf'
import { isQaStageKey, qaStageLabel, firesockRequirementMet, stageAllowsFiresockNa } from '@/lib/qa/stages'
import { fetchPlotDetailsBySite } from '@/lib/jetwash/plot-descriptions'
import { MAX_QA_INSPECTION_PHOTOS, photoExtension, type StoredInspectionPhoto, isImageUploadFile } from '@/lib/qa/inspection-photos'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import {
  checklistComplete,
  checklistForStage,
  parseChecklistAnswers,
  type QaChecklistAnswers,
} from '@/lib/qa/checklists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const siteId         = formData.get('siteId') as string
    const plotNumber     = (formData.get('plotNumber') as string)?.trim()
    const stage          = formData.get('stage') as string
    const inspectorName  = (formData.get('inspectorName') as string)?.trim()
    const inspectionDate = (formData.get('inspectionDate') as string)?.trim()
    const observations   = (formData.get('observations') as string)?.trim() ?? ''
    const result         = (formData.get('result') as string)?.trim() || 'Pass'
    const firesockNa     = formData.get('firesockNa') === 'true'
    const firesockPhoto  = formData.get('firesockPhoto') as File | null
    const signature      = formData.get('signature') as File | null
    const checklistRaw   = formData.get('checklist') as string | null
    const inspectionPhotoFiles = (formData.getAll('inspectionPhotos') as File[])
      .filter(isImageUploadFile)

    if (!siteId || !plotNumber || !stage || !inspectorName || !inspectionDate) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (!isQaStageKey(stage)) {
      return NextResponse.json({ error: 'Invalid inspection stage.' }, { status: 400 })
    }

    let checklistAnswers: QaChecklistAnswers = {}
    if (checklistRaw) {
      try {
        checklistAnswers = parseChecklistAnswers(JSON.parse(checklistRaw))
      } catch {
        return NextResponse.json({ error: 'Invalid checklist data.' }, { status: 400 })
      }
    }

    const stageChecklist = checklistForStage(stage)
    if (stageChecklist.length > 0 && !checklistComplete(stage, checklistAnswers)) {
      return NextResponse.json(
        { error: 'Tick every item on the inspection checklist before completing.' },
        { status: 400 },
      )
    }

    if (!signature) {
      return NextResponse.json({ error: 'Signature is required.' }, { status: 400 })
    }
    if (inspectionPhotoFiles.length > MAX_QA_INSPECTION_PHOTOS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_QA_INSPECTION_PHOTOS} inspection photos allowed.` },
        { status: 400 },
      )
    }

    const hasFiresockPhoto = !!(firesockPhoto && firesockPhoto.size > 0)
    if (!firesockRequirementMet(stage, { firesockNa, hasPhoto: hasFiresockPhoto })) {
      const msg = stageAllowsFiresockNa(stage)
        ? 'Upload a firesock photo or select N/A before completing this inspection.'
        : 'Upload a firesock photo before completing this inspection.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (firesockNa && hasFiresockPhoto) {
      return NextResponse.json({ error: 'Choose either a firesock photo or N/A, not both.' }, { status: 400 })
    }
    if (!stageAllowsFiresockNa(stage) && firesockNa) {
      return NextResponse.json({ error: 'N/A is only available for Joist lift.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: site } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .maybeSingle()

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const signatureBuffer = Buffer.from(await signature.arrayBuffer())
    const signedAt = new Date()
    const plotDetails = (await fetchPlotDetailsBySite(siteId)).get(plotNumber) ?? []
    const ts = Date.now()

    let firesockBuffer: Buffer | undefined
    let firesockMime: string | undefined
    let firesockPhotoPath: string | undefined

    if (hasFiresockPhoto && firesockPhoto) {
      const raw = Buffer.from(await firesockPhoto.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      firesockBuffer = normalized.buffer
      firesockMime = normalized.mime
    }

    const inspectionBuffers: { buffer: Buffer; mime: string }[] = []
    for (const file of inspectionPhotoFiles) {
      const raw = Buffer.from(await file.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      inspectionBuffers.push({
        buffer: normalized.buffer,
        mime:   normalized.mime,
      })
    }

    const pdfPhotos: QaPdfPhoto[] = []
    if (firesockBuffer && firesockMime) {
      pdfPhotos.push({ label: 'Firesock photo', buffer: firesockBuffer, mime: firesockMime })
    }
    inspectionBuffers.forEach((item, index) => {
      pdfPhotos.push({
        label: `Inspection photo ${index + 1}`,
        buffer: item.buffer,
        mime: item.mime,
      })
    })

    const pdfChecklist = stageChecklist.map((item) => ({
      label:   item.label,
      checked: checklistAnswers[item.key] === true,
    }))

    const pdfBuffer = await generateQaInspectionPdf({
      siteName:       site.name,
      plotNumber,
      stage,
      inspectorName,
      inspectionDate,
      observations,
      result,
      signedAt,
      signaturePng: signatureBuffer,
      plotDetails,
      firesockNa:     firesockNa && stageAllowsFiresockNa(stage),
      photos:         pdfPhotos,
      checklist:      pdfChecklist.length ? pdfChecklist : undefined,
    })

    const signaturePath = `qa/${siteId}/${plotNumber}/${stage}/${ts}-signature.png`
    const pdfPath       = `qa/${siteId}/${plotNumber}/${stage}/${ts}-inspection.pdf`
    const storedInspectionPhotos: StoredInspectionPhoto[] = []

    if (firesockBuffer && firesockMime) {
      const ext = photoExtension(firesockMime)
      firesockPhotoPath = `qa/${siteId}/${plotNumber}/${stage}/${ts}-firesock.${ext}`
      const { error: firesockErr } = await supabase.storage
        .from('worker-documents')
        .upload(firesockPhotoPath, firesockBuffer, { contentType: firesockMime, upsert: false })
      if (firesockErr) {
        return NextResponse.json({ error: `Firesock photo upload failed: ${firesockErr.message}` }, { status: 500 })
      }
    }

    for (let i = 0; i < inspectionBuffers.length; i++) {
      const { buffer, mime } = inspectionBuffers[i]
      const ext = photoExtension(mime)
      const path = `qa/${siteId}/${plotNumber}/${stage}/${ts}-photo-${i + 1}.${ext}`
      const { error: photoErr } = await supabase.storage
        .from('worker-documents')
        .upload(path, buffer, { contentType: mime, upsert: false })
      if (photoErr) {
        return NextResponse.json({ error: `Inspection photo upload failed: ${photoErr.message}` }, { status: 500 })
      }
      storedInspectionPhotos.push({ path, mime })
    }

    const { error: sigUploadErr } = await supabase.storage
      .from('worker-documents')
      .upload(signaturePath, signatureBuffer, { contentType: 'image/png', upsert: false })

    if (sigUploadErr) {
      return NextResponse.json({ error: `Signature upload failed: ${sigUploadErr.message}` }, { status: 500 })
    }

    const { error: pdfUploadErr } = await supabase.storage
      .from('worker-documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

    if (pdfUploadErr) {
      return NextResponse.json({ error: `PDF upload failed: ${pdfUploadErr.message}` }, { status: 500 })
    }

    const workerId = auth.worker?.id ?? null
    const nowIso = signedAt.toISOString()

    const row = {
      site_id:        siteId,
      plot_number:    plotNumber,
      stage,
      status:         'completed',
      form_data: {
        inspectorName,
        inspectionDate,
        observations,
        result,
        stageLabel: qaStageLabel(stage),
        firesock_na: firesockNa && stageAllowsFiresockNa(stage),
        firesock_photo_path: firesockPhotoPath ?? null,
        inspection_photo_paths: storedInspectionPhotos.map((p) => p.path),
        checklist: checklistAnswers,
      },
      notes:          observations,
      signature_path: signaturePath,
      pdf_path:       pdfPath,
      inspected_by:   workerId,
      inspected_at:   nowIso,
      updated_at:     nowIso,
    }

    const { data: inspection, error: upsertErr } = await supabase
      .from('qa_plot_inspections')
      .upsert(row, { onConflict: 'site_id,plot_number,stage' })
      .select('id')
      .single()

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    const grid = await fetchQaSiteGrid(siteId)

    return NextResponse.json({
      success: true,
      inspectionId: inspection.id,
      grid,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

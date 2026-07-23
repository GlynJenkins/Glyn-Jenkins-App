import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import { loadCompanyBranding, parseSiteDocumentDetails } from '@/lib/documents/company-branding'
import { generateQaInspectionPdf, type QaPdfPhoto } from '@/lib/qa/generate-inspection-pdf'
import { isQaStageKey, qaStageLabel, firesockRequirementMet, stageAllowsFiresockNa } from '@/lib/qa/stages'
import { fetchPlotDetailsBySite } from '@/lib/jetwash/plot-descriptions'
import { MAX_QA_INSPECTION_PHOTOS, photoExtension, type StoredInspectionPhoto, isImageUploadFile } from '@/lib/qa/inspection-photos'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import {
  checklistAllAnswered,
  checklistForStage,
  parseChecklistAnswers,
  type QaChecklistAnswers,
} from '@/lib/qa/checklists'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024  // 1 MB — signature pad PNGs are tiny
const MAX_PHOTO_BYTES     = 20 * 1024 * 1024 // 20 MB per photo before normalisation

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length > PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const siteId         = formData.get('siteId') as string
    const plotNumber     = (formData.get('plotNumber') as string)?.trim()
    const stage          = formData.get('stage') as string
    const submittedName  = (formData.get('inspectorName') as string)?.trim()
    const inspectionDate = (formData.get('inspectionDate') as string)?.trim()
    const observations   = (formData.get('observations') as string)?.trim() ?? ''
    const result         = (formData.get('result') as string)?.trim() || 'Pass'
    const firesockNa     = formData.get('firesockNa') === 'true'
    const firesockPhoto  = formData.get('firesockPhoto') as File | null
    const signature      = formData.get('signature') as File | null
    const checklistRaw   = formData.get('checklist') as string | null
    const inspectionPhotoFiles = (formData.getAll('inspectionPhotos') as File[])
      .filter(isImageUploadFile)

    // The authenticated user is the source of truth for who signed off —
    // the form-supplied name is only a fallback for legacy accounts with no worker row.
    const inspectorName = auth.worker
      ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
      : submittedName

    if (!siteId || !plotNumber || !stage || !inspectorName || !inspectionDate) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (!isQaStageKey(stage)) {
      return NextResponse.json({ error: 'Invalid inspection stage.' }, { status: 400 })
    }
    if (result !== 'Pass' && result !== 'Fail') {
      return NextResponse.json({ error: 'Result must be Pass or Fail.' }, { status: 400 })
    }
    // Plot numbers appear in storage keys — never allow path traversal characters.
    if (plotNumber.includes('/') || plotNumber.includes('..') || plotNumber.length > 60) {
      return NextResponse.json({ error: 'Invalid plot number.' }, { status: 400 })
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
    if (stageChecklist.length > 0 && !checklistAllAnswered(stage, checklistAnswers)) {
      return NextResponse.json(
        { error: 'Select Yes, No, or N/A for every checklist item.' },
        { status: 400 },
      )
    }

    if (!signature) {
      return NextResponse.json({ error: 'Signature is required.' }, { status: 400 })
    }
    if (signature.size > MAX_SIGNATURE_BYTES) {
      return NextResponse.json({ error: 'Signature image is too large.' }, { status: 400 })
    }
    if (inspectionPhotoFiles.length > MAX_QA_INSPECTION_PHOTOS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_QA_INSPECTION_PHOTOS} inspection photos allowed.` },
        { status: 400 },
      )
    }
    for (const file of inspectionPhotoFiles) {
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: `Photo "${file.name}" is too large (max 20 MB).` }, { status: 400 })
      }
    }
    if (firesockPhoto && firesockPhoto.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: 'Firesock photo is too large (max 20 MB).' }, { status: 400 })
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

    const [company, { data: site }] = await Promise.all([
      loadCompanyBranding(),
      supabase
        .from('sites')
        .select(`
          id, name,
          document_address, developer_name, developer_contact,
          surveyor_name, document_reference
        `)
        .eq('id', siteId)
        .maybeSingle(),
    ])

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    // The plot must actually exist on this site's grid.
    const { data: plotCell } = await supabase
      .from('price_grid')
      .select('plot_number')
      .eq('site_id', siteId)
      .eq('plot_number', plotNumber)
      .limit(1)
      .maybeSingle()
    if (!plotCell) {
      return NextResponse.json({ error: 'Plot not found on this site.' }, { status: 400 })
    }

    const signatureBuffer = Buffer.from(await signature.arrayBuffer())
    if (!isPngBuffer(signatureBuffer)) {
      return NextResponse.json({ error: 'Signature must be a PNG image.' }, { status: 400 })
    }
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
      label:  item.label,
      answer: checklistAnswers[item.key] as 'yes' | 'no' | 'na',
    }))

    const pdfBuffer = await generateQaInspectionPdf({
      siteName:       site.name,
      siteDocuments:  parseSiteDocumentDetails(site),
      company,
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

    // Track everything written to storage so a failure partway through
    // can clean up instead of leaving orphaned objects.
    const uploadedPaths: string[] = []
    const cleanupUploads = async () => {
      if (uploadedPaths.length === 0) return
      try {
        await supabase.storage.from('worker-documents').remove(uploadedPaths)
      } catch (cleanupErr) {
        console.error('[QA] Failed to clean up uploads:', cleanupErr)
      }
    }

    if (firesockBuffer && firesockMime) {
      const ext = photoExtension(firesockMime)
      firesockPhotoPath = `qa/${siteId}/${plotNumber}/${stage}/${ts}-firesock.${ext}`
      const { error: firesockErr } = await supabase.storage
        .from('worker-documents')
        .upload(firesockPhotoPath, firesockBuffer, { contentType: firesockMime, upsert: false })
      if (firesockErr) {
        console.error('[QA] Firesock photo upload failed:', firesockErr)
        return NextResponse.json({ error: 'Firesock photo upload failed.' }, { status: 500 })
      }
      uploadedPaths.push(firesockPhotoPath)
    }

    for (let i = 0; i < inspectionBuffers.length; i++) {
      const { buffer, mime } = inspectionBuffers[i]
      const ext = photoExtension(mime)
      const path = `qa/${siteId}/${plotNumber}/${stage}/${ts}-photo-${i + 1}.${ext}`
      const { error: photoErr } = await supabase.storage
        .from('worker-documents')
        .upload(path, buffer, { contentType: mime, upsert: false })
      if (photoErr) {
        console.error('[QA] Inspection photo upload failed:', photoErr)
        await cleanupUploads()
        return NextResponse.json({ error: 'Inspection photo upload failed.' }, { status: 500 })
      }
      uploadedPaths.push(path)
      storedInspectionPhotos.push({ path, mime })
    }

    const { error: sigUploadErr } = await supabase.storage
      .from('worker-documents')
      .upload(signaturePath, signatureBuffer, { contentType: 'image/png', upsert: false })

    if (sigUploadErr) {
      console.error('[QA] Signature upload failed:', sigUploadErr)
      await cleanupUploads()
      return NextResponse.json({ error: 'Signature upload failed.' }, { status: 500 })
    }
    uploadedPaths.push(signaturePath)

    const { error: pdfUploadErr } = await supabase.storage
      .from('worker-documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

    if (pdfUploadErr) {
      console.error('[QA] PDF upload failed:', pdfUploadErr)
      await cleanupUploads()
      return NextResponse.json({ error: 'PDF upload failed.' }, { status: 500 })
    }
    uploadedPaths.push(pdfPath)

    const workerId = auth.worker?.id ?? null
    const nowIso = signedAt.toISOString()

    // If a completed inspection already exists for this plot/stage, archive it
    // to qa_inspection_history BEFORE overwriting so the original sign-off
    // (who/when/result/PDF) is preserved.
    const { data: existing } = await supabase
      .from('qa_plot_inspections')
      .select('*')
      .eq('site_id', siteId)
      .eq('plot_number', plotNumber)
      .eq('stage', stage)
      .maybeSingle()

    if (existing && existing.status === 'completed') {
      const { error: archiveErr } = await supabase
        .from('qa_inspection_history')
        .insert({
          inspection_id:  existing.id,
          site_id:        existing.site_id,
          plot_number:    existing.plot_number,
          stage:          existing.stage,
          status:         existing.status,
          form_data:      existing.form_data,
          notes:          existing.notes,
          signature_path: existing.signature_path,
          pdf_path:       existing.pdf_path,
          inspected_by:   existing.inspected_by,
          inspected_at:   existing.inspected_at,
          archived_by:    workerId,
        })
      if (archiveErr) {
        console.error('[QA] Failed to archive prior inspection:', archiveErr)
        await cleanupUploads()
        return NextResponse.json(
          { error: 'Could not archive the previous inspection — re-inspection aborted. (Has the qa_inspection_history migration been run?)' },
          { status: 500 },
        )
      }
    }

    const row = {
      site_id:        siteId,
      plot_number:    plotNumber,
      stage,
      status:         'completed',
      form_data: {
        inspectorName,
        // Flag if the form-submitted name differed from the logged-in account.
        submittedInspectorName: submittedName && submittedName !== inspectorName ? submittedName : undefined,
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
      console.error('[QA] Inspection save failed:', upsertErr)
      await cleanupUploads()
      return NextResponse.json({ error: 'Failed to save inspection.' }, { status: 500 })
    }

    const grid = await fetchQaSiteGrid(siteId)

    return NextResponse.json({
      success: true,
      inspectionId: inspection.id,
      grid,
    })
  } catch (err) {
    console.error('[QA] Inspection error:', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

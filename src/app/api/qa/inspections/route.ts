import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid } from '@/lib/qa/queries'
import { generateQaInspectionPdf } from '@/lib/qa/generate-inspection-pdf'
import { isQaStageKey, qaStageLabel } from '@/lib/qa/stages'
import { fetchPlotDetailsBySite } from '@/lib/jetwash/plot-descriptions'

export const dynamic = 'force-dynamic'

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
    const signature      = formData.get('signature') as File | null

    if (!siteId || !plotNumber || !stage || !inspectorName || !inspectionDate) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (!isQaStageKey(stage)) {
      return NextResponse.json({ error: 'Invalid inspection stage.' }, { status: 400 })
    }
    if (!signature) {
      return NextResponse.json({ error: 'Signature is required.' }, { status: 400 })
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
    })

    const ts = Date.now()
    const signaturePath = `qa/${siteId}/${plotNumber}/${stage}/${ts}-signature.png`
    const pdfPath       = `qa/${siteId}/${plotNumber}/${stage}/${ts}-inspection.pdf`

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

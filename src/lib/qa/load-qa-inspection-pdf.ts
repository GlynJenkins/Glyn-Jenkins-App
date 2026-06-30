import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  loadCompanyBranding,
  parseSiteDocumentDetails,
} from '@/lib/documents/company-branding'
import { fetchPlotDetailsBySite } from '@/lib/jetwash/plot-descriptions'
import {
  checklistForStage,
  parseChecklistAnswers,
} from '@/lib/qa/checklists'
import type { QaInspectionPdfInput, QaPdfPhoto } from '@/lib/qa/generate-inspection-pdf'
import { isQaStageKey } from '@/lib/qa/stages'

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

async function downloadStorageFile(path: string): Promise<Buffer | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from('worker-documents').download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function loadQaInspectionPdfData(
  inspectionId: string
): Promise<QaInspectionPdfInput | null> {
  const supabase = createServiceClient()

  const { data: inspection } = await supabase
    .from('qa_plot_inspections')
    .select(`
      id, plot_number, stage, inspected_at, notes, signature_path, form_data,
      sites (
        id, name,
        document_address, developer_name, developer_contact,
        surveyor_name, document_reference
      )
    `)
    .eq('id', inspectionId)
    .eq('status', 'completed')
    .maybeSingle()

  if (!inspection?.signature_path || !isQaStageKey(inspection.stage)) return null

  const form = (inspection.form_data ?? {}) as {
    inspectorName?:     string
    inspectionDate?:    string
    observations?:      string
    result?:            string
    firesock_na?:       boolean
    firesock_photo_path?: string | null
    inspection_photo_paths?: string[] | null
    checklist?:         unknown
  }

  const site = relationOne(inspection.sites)
  const company = await loadCompanyBranding()

  const signatureBuffer = await downloadStorageFile(inspection.signature_path)
  if (!signatureBuffer) return null

  const pdfPhotos: QaPdfPhoto[] = []

  if (form.firesock_photo_path) {
    const buffer = await downloadStorageFile(form.firesock_photo_path)
    if (buffer) {
      pdfPhotos.push({
        label:  'Firesock photo',
        buffer,
        mime:   mimeFromPath(form.firesock_photo_path),
      })
    }
  }

  for (const [index, path] of (form.inspection_photo_paths ?? []).entries()) {
    const buffer = await downloadStorageFile(path)
    if (buffer) {
      pdfPhotos.push({
        label:  `Inspection photo ${index + 1}`,
        buffer,
        mime:   mimeFromPath(path),
      })
    }
  }

  const plotDetails = site?.id
    ? (await fetchPlotDetailsBySite(site.id)).get(inspection.plot_number) ?? []
    : []

  const checklistAnswers = parseChecklistAnswers(form.checklist)
  const stageChecklist = checklistForStage(inspection.stage)
  const pdfChecklist = stageChecklist.map((item) => ({
    label:  item.label,
    answer: checklistAnswers[item.key] as 'yes' | 'no' | 'na',
  })).filter((item) => item.answer === 'yes' || item.answer === 'no' || item.answer === 'na')

  const inspectedAt = inspection.inspected_at
    ? new Date(inspection.inspected_at)
    : new Date()

  return {
    siteName:       site?.name ?? 'Unknown site',
    siteDocuments:  parseSiteDocumentDetails(site),
    company,
    plotNumber:     inspection.plot_number,
    stage:          inspection.stage,
    inspectorName:  form.inspectorName?.trim() || 'Inspector',
    inspectionDate: form.inspectionDate?.trim() || inspectedAt.toLocaleDateString('en-GB'),
    observations:   form.observations?.trim() || inspection.notes?.trim() || '',
    result:         form.result?.trim() || 'Pass',
    signedAt:       inspectedAt,
    signaturePng:   signatureBuffer,
    plotDetails,
    firesockNa:     form.firesock_na ?? false,
    photos:         pdfPhotos.length ? pdfPhotos : undefined,
    checklist:      pdfChecklist.length ? pdfChecklist : undefined,
  }
}

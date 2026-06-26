import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchQaSiteGrid, getQaInspectionById } from '@/lib/qa/queries'
import { storagePathsFromFormData } from '@/lib/qa/inspection-photos'

export const dynamic = 'force-dynamic'

function storagePathsForInspection(row: {
  signature_path: string | null
  pdf_path: string | null
  form_data: unknown
}): string[] {
  const paths: string[] = []
  if (row.signature_path) paths.push(row.signature_path)
  if (row.pdf_path) paths.push(row.pdf_path)
  paths.push(...storagePathsFromFormData(row.form_data))
  return paths
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { inspectionId } = await params
    const inspection = await getQaInspectionById(inspectionId)

    if (!inspection) {
      return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
    }
    if (inspection.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed inspections can be removed.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const storagePaths = storagePathsForInspection(inspection)

    const { error: deleteErr } = await supabase
      .from('qa_plot_inspections')
      .delete()
      .eq('id', inspectionId)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    if (storagePaths.length > 0) {
      await supabase.storage.from('worker-documents').remove(storagePaths)
    }

    const grid = await fetchQaSiteGrid(inspection.site_id)

    return NextResponse.json({ success: true, grid })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

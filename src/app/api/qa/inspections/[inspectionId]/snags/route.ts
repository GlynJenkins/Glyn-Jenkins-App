import { NextRequest, NextResponse } from 'next/server'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchSnagsForInspection } from '@/lib/qa/snags'
import { isQaStageKey, qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'

async function signedPhotoUrl(
  supabase: ReturnType<typeof createServiceClient>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage
    .from('worker-documents')
    .createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** Management: snags for an inspection with signed photo URLs. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> },
) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { inspectionId } = await params
    const supabase = createServiceClient()

    const { data: inspection, error } = await supabase
      .from('qa_plot_inspections')
      .select('id, site_id, plot_number, stage, status, inspection_state, inspected_at')
      .eq('id', inspectionId)
      .eq('status', 'completed')
      .maybeSingle()

    if (error || !inspection) {
      return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
    }

    const snags = await fetchSnagsForInspection(supabase, inspectionId)
    const withUrls = await Promise.all(
      snags.map(async (s) => ({
        id:               s.id,
        round:            s.round,
        description:      s.description,
        fixed:            s.fixed,
        fixed_at:         s.fixed_at,
        fixed_note:       s.fixed_note,
        sort_order:       s.sort_order,
        created_at:       s.created_at,
        raised_photo_url: await signedPhotoUrl(supabase, s.raised_photo_path),
        fixed_photo_url:  await signedPhotoUrl(supabase, s.fixed_photo_path),
      })),
    )

    const stageLabel = isQaStageKey(inspection.stage)
      ? qaStageLabel(inspection.stage)
      : inspection.stage

    return NextResponse.json({
      inspection: {
        id:              inspection.id,
        siteId:          inspection.site_id,
        plotNumber:      inspection.plot_number,
        stage:           inspection.stage,
        stageLabel,
        inspectionState: inspection.inspection_state,
        inspectedAt:     inspection.inspected_at,
      },
      snags: withUrls,
      openCount: withUrls.filter((s) => !s.fixed).length,
    })
  } catch (err) {
    console.error('[QA] GET snags', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

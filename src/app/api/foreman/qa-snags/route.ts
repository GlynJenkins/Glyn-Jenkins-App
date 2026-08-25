import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { qaStageLabel } from '@/lib/qa/stages'

export const dynamic = 'force-dynamic'

async function assertAssignedSite(foremanId: string, siteId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foremanId)
    .eq('site_id', siteId)
    .maybeSingle()
  return !!data
}

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

export async function GET(request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const siteId = new URL(request.url).searchParams.get('siteId')?.trim()
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
    }
    if (!(await assertAssignedSite(auth.worker.id, siteId))) {
      return NextResponse.json({ error: 'Site not assigned to you.' }, { status: 403 })
    }

    const supabase = createServiceClient()
    const { data: inspections, error } = await supabase
      .from('qa_plot_inspections')
      .select('id, plot_number, stage, inspection_state, inspected_at, form_data')
      .eq('site_id', siteId)
      .eq('status', 'completed')
      .in('inspection_state', ['failed_open', 'awaiting_reinspection'])
      .order('plot_number')

    if (error) {
      return NextResponse.json({ error: 'Could not load inspections.' }, { status: 500 })
    }

    const ids = (inspections ?? []).map((i) => i.id)
    type SnagRow = {
      id: string
      inspection_id: string
      round: number
      description: string
      raised_photo_path: string | null
      fixed: boolean
      fixed_at: string | null
      fixed_note: string | null
      fixed_photo_path: string | null
      sort_order: number
      created_at: string
    }
    const { data: snags } = ids.length
      ? await supabase
          .from('qa_inspection_snags')
          .select('*')
          .in('inspection_id', ids)
          .order('round')
          .order('sort_order')
      : { data: [] as SnagRow[] }

    const snagsByInspection = new Map<string, SnagRow[]>()
    for (const snag of (snags ?? []) as SnagRow[]) {
      const list = snagsByInspection.get(snag.inspection_id) ?? []
      list.push(snag)
      snagsByInspection.set(snag.inspection_id, list)
    }

    const groups = []
    for (const insp of inspections ?? []) {
      const inspSnags = snagsByInspection.get(insp.id) ?? []
      const withUrls = await Promise.all(
        inspSnags.map(async (s) => ({
          id:               s.id,
          round:            s.round,
          description:      s.description,
          fixed:            s.fixed,
          fixed_at:         s.fixed_at,
          fixed_note:       s.fixed_note,
          raised_photo_url: await signedPhotoUrl(supabase, s.raised_photo_path),
          fixed_photo_url:  await signedPhotoUrl(supabase, s.fixed_photo_path),
        })),
      )

      groups.push({
        inspectionId:    insp.id,
        plotNumber:      insp.plot_number,
        stage:           insp.stage,
        stageLabel:      qaStageLabel(insp.stage),
        inspectionState: insp.inspection_state,
        inspectedAt:     insp.inspected_at,
        snags:           withUrls,
        openCount:       withUrls.filter((s) => !s.fixed).length,
      })
    }

    const openTotal = groups.reduce((n, g) => n + g.openCount, 0)

    return NextResponse.json({ siteId, openTotal, groups })
  } catch (err) {
    console.error('[foreman/qa-snags GET]', err)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}

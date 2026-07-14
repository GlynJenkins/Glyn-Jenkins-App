import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function isTotalLikeStageName(name: string): boolean {
  const n = name.toLowerCase().trim()
  return n.includes('total') || n.includes('subtotal') || n === 'sum'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const body = await request.json() as { stage_name?: string }
    const stageName = body.stage_name?.trim()

    if (!stageName) {
      return NextResponse.json({ error: 'Enter a column name.' }, { status: 400 })
    }
    if (stageName.length > 80) {
      return NextResponse.json({ error: 'Column name is too long.' }, { status: 400 })
    }
    if (isTotalLikeStageName(stageName)) {
      return NextResponse.json(
        { error: 'Avoid "Total" in the name — summary columns are excluded from row totals.' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    const { data: existingStages, error: stagesErr } = await supabase
      .from('site_stages')
      .select('id, stage_name, stage_order')
      .eq('site_id', siteId)
      .order('stage_order')

    if (stagesErr) {
      return NextResponse.json({ error: stagesErr.message }, { status: 500 })
    }
    if (!existingStages?.length) {
      return NextResponse.json(
        { error: 'Import a price grid first before adding columns.' },
        { status: 400 },
      )
    }

    const duplicate = existingStages.some(
      (s) => s.stage_name.trim().toLowerCase() === stageName.toLowerCase(),
    )
    if (duplicate) {
      return NextResponse.json({ error: `Column "${stageName}" already exists on this site.` }, { status: 400 })
    }

    const maxOrder = existingStages.reduce((max, s) => Math.max(max, s.stage_order), 0)
    const stageOrder = maxOrder + 1

    const { data: stage, error: insertStageErr } = await supabase
      .from('site_stages')
      .insert({ site_id: siteId, stage_name: stageName, stage_order: stageOrder })
      .select('id, stage_name, stage_order')
      .single()

    if (insertStageErr || !stage) {
      return NextResponse.json(
        { error: insertStageErr?.message ?? 'Failed to create column.' },
        { status: 500 },
      )
    }

    const plotNumbers = new Set<string>()
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data: page, error: plotsErr } = await supabase
        .from('price_grid')
        .select('plot_number')
        .eq('site_id', siteId)
        .range(from, from + PAGE - 1)

      if (plotsErr) {
        await supabase.from('site_stages').delete().eq('id', stage.id)
        return NextResponse.json({ error: plotsErr.message }, { status: 500 })
      }
      if (!page?.length) break

      for (const row of page) {
        const plot = row.plot_number?.trim()
        if (plot) plotNumbers.add(plot)
      }
      if (page.length < PAGE) break
      from += PAGE
    }

    if (plotNumbers.size === 0) {
      await supabase.from('site_stages').delete().eq('id', stage.id)
      return NextResponse.json({ error: 'No plots found on this site.' }, { status: 400 })
    }

    const cells = Array.from(plotNumbers).map((plot_number) => ({
      site_id:          siteId,
      stage_id:         stage.id,
      plot_number,
      contract_value:   null,
      override_note:    null,
      cell_color:       'white',
      total_claimed_pct: 0,
    }))

    const BATCH = 500
    for (let i = 0; i < cells.length; i += BATCH) {
      const { error: cellsErr } = await supabase.from('price_grid').insert(cells.slice(i, i + BATCH))
      if (cellsErr) {
        await supabase.from('price_grid').delete().eq('site_id', siteId).eq('stage_id', stage.id)
        await supabase.from('site_stages').delete().eq('id', stage.id)
        return NextResponse.json({ error: cellsErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success:      true,
      stage_name:   stage.stage_name,
      stage_order:  stage.stage_order,
      plot_count:   plotNumbers.size,
      cells_created: cells.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const RATES: Record<string, number> = {
  bricklayer: 30,
  labourer:   15,
  apprentice: 10,
}

export async function POST(request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData   = await request.formData()
    const siteId     = formData.get('siteId')     as string
    const foremanId  = formData.get('foremanId')  as string
    const description = (formData.get('description') as string)?.trim()
    const photo      = formData.get('photo')      as File | null
    const workersJson = formData.get('workers')   as string

    if (!siteId || !foremanId || !description || !workersJson) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }
    if (!photo) {
      return NextResponse.json({ error: 'A photo is required as proof of work.' }, { status: 400 })
    }

    const workerEntries: { workerId: string; workerRole: string; hours: number }[] =
      JSON.parse(workersJson)

    if (!workerEntries.length) {
      return NextResponse.json({ error: 'Add at least one worker.' }, { status: 400 })
    }

    if (foremanId !== auth.worker.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    if (!(await foremanHasSiteAccess(auth.worker.id, siteId))) {
      return NextResponse.json({ error: 'Forbidden — site not assigned to you.' }, { status: 403 })
    }

    const supabase = createServiceClient()

    // ── Upload photo once — shared across all claim lines ─────
    const ext    = photo.name.split('.').pop() ?? 'jpg'
    const path   = `variations/${siteId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await photo.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(path, buffer, { contentType: photo.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // ── Insert one variation_claim per worker line ─────────────
    const records = workerEntries.map(({ workerId, workerRole, hours }) => ({
      site_id:       siteId,
      foreman_id:    foremanId,
      worker_id:     workerId,
      worker_role:   workerRole,
      hours,
      rate_per_hour: RATES[workerRole] ?? 0,
      description,
      photo_urls:    [path],
      status:        'pending',
    }))

    const { error: insertError } = await supabase.from('variation_claims').insert(records)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, lines: records.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

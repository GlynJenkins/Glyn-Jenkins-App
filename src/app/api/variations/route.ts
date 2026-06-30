import { NextRequest, NextResponse } from 'next/server'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import { VARIATION_RATES } from '@/lib/variations/rates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_ROLES = Object.keys(VARIATION_RATES) as (keyof typeof VARIATION_RATES)[]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export async function POST(request: NextRequest) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData    = await request.formData()
    const siteId      = formData.get('siteId') as string
    const foremanId   = formData.get('foremanId') as string
    const description = (formData.get('description') as string)?.trim()
    const photo       = formData.get('photo') as File | null
    const workersJson = formData.get('workers') as string

    if (!siteId || !foremanId || !description || !workersJson) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }
    if (!isUuid(siteId) || !isUuid(foremanId)) {
      return NextResponse.json({ error: 'Invalid site or foreman reference.' }, { status: 400 })
    }
    if (!photo || photo.size === 0) {
      return NextResponse.json({ error: 'A photo is required as proof of work.' }, { status: 400 })
    }

    let workerEntries: { workerId: string; workerRole: string; hours: number }[]
    try {
      workerEntries = JSON.parse(workersJson)
    } catch {
      return NextResponse.json({ error: 'Invalid worker data. Please refresh and try again.' }, { status: 400 })
    }

    if (!Array.isArray(workerEntries) || !workerEntries.length) {
      return NextResponse.json({ error: 'Add at least one worker.' }, { status: 400 })
    }

    for (const entry of workerEntries) {
      if (!isUuid(entry.workerId)) {
        return NextResponse.json({ error: 'Invalid worker selected. Please refresh and try again.' }, { status: 400 })
      }
      if (!ALLOWED_ROLES.includes(entry.workerRole as keyof typeof VARIATION_RATES)) {
        return NextResponse.json(
          { error: `Worker role "${entry.workerRole}" is not valid for variations.` },
          { status: 400 }
        )
      }
      if (typeof entry.hours !== 'number' || entry.hours <= 0) {
        return NextResponse.json({ error: 'Enter valid hours for each worker.' }, { status: 400 })
      }
    }

    if (foremanId !== auth.worker.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    if (!(await foremanHasSiteAccess(auth.worker.id, siteId))) {
      return NextResponse.json({ error: 'Forbidden — site not assigned to you.' }, { status: 403 })
    }

    const supabase = createServiceClient()

    let normalized: { buffer: Buffer; mime: string }
    try {
      const raw = Buffer.from(await photo.arrayBuffer())
      normalized = await normalizePhotoForPdf(raw)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not process photo.' },
        { status: 400 }
      )
    }

    const path = `variations/${siteId}/${Date.now()}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(path, normalized.buffer, { contentType: normalized.mime, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const records = workerEntries.map(({ workerId, workerRole, hours }) => ({
      site_id:       siteId,
      foreman_id:    foremanId,
      worker_id:     workerId,
      worker_role:   workerRole,
      hours,
      rate_per_hour: VARIATION_RATES[workerRole as keyof typeof VARIATION_RATES],
      description,
      photo_urls:    [path],
      status:        'pending',
    }))

    const { error: insertError } = await supabase.from('variation_claims').insert(records)
    if (insertError) {
      await supabase.storage.from('worker-documents').remove([path])
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, lines: records.length })
  } catch (err) {
    console.error('[variations] submit failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}

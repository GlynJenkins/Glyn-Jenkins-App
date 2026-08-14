import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET ?siteId= — list talks for a site (or all sites summary if omitted is handled by page). */
export async function GET(request: NextRequest) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const siteId = request.nextUrl.searchParams.get('siteId')?.trim()
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: talks, error } = await supabase
      .from('toolbox_talks')
      .select(`
        id, title, description, status, conducted_at, conducted_by_name, conducted_by_role,
        pdf_path, site_id,
        toolbox_talk_attendees ( id )
      `)
      .eq('site_id', siteId)
      .order('conducted_at', { ascending: false })

    if (error) return apiError('api/admin/toolbox-talks GET', error, 'Could not load toolbox talks.')

    const items = (talks ?? []).map((t) => ({
      id:               t.id,
      title:            t.title,
      description:      t.description,
      status:           t.status,
      conductedAt:      t.conducted_at,
      conductedByName:  t.conducted_by_name,
      conductedByRole:  t.conducted_by_role,
      siteId:           t.site_id,
      pdfReady:         !!t.pdf_path,
      attendeeCount:    Array.isArray(t.toolbox_talk_attendees) ? t.toolbox_talk_attendees.length : 0,
    }))

    return NextResponse.json({ talks: items })
  } catch (err) {
    return apiError('api/admin/toolbox-talks GET', err)
  }
}

/** POST — create draft talk + attendees with name/role snapshots. */
export async function POST(request: NextRequest) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as {
      siteId?: string
      title?: string
      description?: string
      attendees?: string[]
      saveAsTemplate?: boolean
    }

    const siteId = body.siteId?.trim()
    const title = body.title?.trim() ?? ''
    const description = body.description?.trim() ?? ''
    const attendeeIds = Array.isArray(body.attendees)
      ? [...new Set(body.attendees.map((id) => String(id).trim()).filter(Boolean))]
      : []

    if (!siteId) {
      return NextResponse.json({ error: 'Site is required.' }, { status: 400 })
    }
    if (!title || title.length > 120) {
      return NextResponse.json({ error: 'Title is required (max 120 characters).' }, { status: 400 })
    }
    if (!description || description.length > 5000) {
      return NextResponse.json({ error: 'Description is required (max 5,000 characters).' }, { status: 400 })
    }
    if (attendeeIds.length < 1) {
      return NextResponse.json({ error: 'Select at least one attendee.' }, { status: 400 })
    }

    const conductedByName = auth.worker
      ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
      : (auth.user.email ?? 'Management')
    const conductedByRole = auth.worker?.role ?? 'management'

    const supabase = createServiceClient()

    const { data: site } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .maybeSingle()

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('id, first_name, surname, role, status')
      .in('id', attendeeIds)
      .eq('status', 'active')

    if (workersError) {
      return apiError('api/admin/toolbox-talks POST workers', workersError, 'Could not load attendees.')
    }
    if (!workers || workers.length === 0) {
      return NextResponse.json({ error: 'No active attendees found for the selected workers.' }, { status: 400 })
    }

    const { data: talk, error: talkError } = await supabase
      .from('toolbox_talks')
      .insert({
        site_id:            siteId,
        title,
        description,
        conducted_by_name:  conductedByName,
        conducted_by_role:  conductedByRole,
        status:             'draft',
        conducted_at:       new Date().toISOString(),
      })
      .select('id, site_id, title, description, status, conducted_at, conducted_by_name, conducted_by_role')
      .single()

    if (talkError || !talk) {
      return apiError('api/admin/toolbox-talks POST talk', talkError, 'Could not create toolbox talk.')
    }

    const attendeeRows = workers.map((w) => ({
      talk_id:     talk.id,
      worker_id:   w.id,
      worker_name: `${w.first_name} ${w.surname}`.trim(),
      worker_role: w.role,
    }))

    const { data: attendees, error: attError } = await supabase
      .from('toolbox_talk_attendees')
      .insert(attendeeRows)
      .select('id, worker_id, worker_name, worker_role, signature_path, signed_at')

    if (attError) {
      await supabase.from('toolbox_talks').delete().eq('id', talk.id)
      return apiError('api/admin/toolbox-talks POST attendees', attError, 'Could not save attendees.')
    }

    if (body.saveAsTemplate) {
      await supabase.from('toolbox_talk_templates').insert({
        title,
        description,
        created_by: conductedByName,
      })
    }

    return NextResponse.json({
      talk: {
        id:              talk.id,
        siteId:          talk.site_id,
        title:           talk.title,
        description:     talk.description,
        status:          talk.status,
        conductedAt:     talk.conducted_at,
        conductedByName: talk.conducted_by_name,
        conductedByRole: talk.conducted_by_role,
        siteName:        site.name,
        attendees: (attendees ?? []).map((a) => ({
          id:            a.id,
          workerId:      a.worker_id,
          workerName:    a.worker_name,
          workerRole:    a.worker_role,
          signaturePath: a.signature_path,
          signedAt:      a.signed_at,
        })),
      },
    })
  } catch (err) {
    return apiError('api/admin/toolbox-talks POST', err)
  }
}

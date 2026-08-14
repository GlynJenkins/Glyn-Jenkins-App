import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import {
  verifyAdminApiAccess,
  verifyManagementAreaApiAccess,
} from '@/lib/auth/portal-access'
import { canAccessAdmin } from '@/lib/worker-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ talkId: string }> }

async function removeStorageFolder(
  supabase: ReturnType<typeof createServiceClient>,
  talkId: string,
) {
  const prefix = `toolbox-talks/${talkId}`
  const { data: files } = await supabase.storage.from('worker-documents').list(prefix)
  if (files && files.length > 0) {
    await supabase.storage
      .from('worker-documents')
      .remove(files.map((f) => `${prefix}/${f.name}`))
  }
}

async function removeStoragePath(
  supabase: ReturnType<typeof createServiceClient>,
  path: string | null,
) {
  if (!path) return
  await supabase.storage.from('worker-documents').remove([path])
}

function mapTalkResponse(
  talk: {
    id: string
    site_id: string
    title: string
    description: string
    status: string
    conducted_at: string
    conducted_by_name: string
    conducted_by_role: string | null
    manager_signature_path: string | null
    amendment_count?: number | null
    amended_at?: string | null
  },
  attendees: {
    id: string
    worker_id: string | null
    worker_name: string
    worker_role: string | null
    signature_path: string | null
    signed_at: string | null
  }[],
  siteName?: string,
) {
  return {
    id: talk.id,
    siteId: talk.site_id,
    siteName,
    title: talk.title,
    description: talk.description,
    status: talk.status,
    conductedAt: talk.conducted_at,
    conductedByName: talk.conducted_by_name,
    conductedByRole: talk.conducted_by_role,
    managerSigned: !!talk.manager_signature_path,
    amendmentCount: talk.amendment_count ?? 0,
    amendedAt: talk.amended_at ?? null,
    attendees: attendees.map((a) => ({
      id: a.id,
      workerId: a.worker_id,
      workerName: a.worker_name,
      workerRole: a.worker_role,
      signaturePath: a.signature_path,
      signedAt: a.signed_at,
    })),
  }
}

/**
 * PATCH — update a draft (title/description/attendees), or amend a completed talk
 * (title/description + add attendees only; admin-only for completed).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { talkId } = await params
  const body = await request.json() as {
    title?: string
    description?: string
    attendees?: string[]
    amend?: boolean
  }

  const title = body.title?.trim()
  const description = body.description?.trim()
  const attendeeIds = Array.isArray(body.attendees)
    ? [...new Set(body.attendees.map((id) => String(id).trim()).filter(Boolean))]
    : null

  if (title !== undefined && (!title || title.length > 120)) {
    return NextResponse.json({ error: 'Title is required (max 120 characters).' }, { status: 400 })
  }
  if (description !== undefined && (!description || description.length > 5000)) {
    return NextResponse.json({ error: 'Description is required (max 5,000 characters).' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data: talk, error: talkError } = await supabase
      .from('toolbox_talks')
      .select(`
        id, site_id, title, description, status, conducted_at,
        conducted_by_name, conducted_by_role, manager_signature_path,
        amendment_count, amended_at, pdf_path
      `)
      .eq('id', talkId)
      .maybeSingle()

    if (talkError) return apiError('api/admin/toolbox-talks/[talkId] PATCH load', talkError)
    if (!talk) return NextResponse.json({ error: 'Talk not found.' }, { status: 404 })

    const isDraft = talk.status === 'draft'
    const isAmending = talk.status === 'amending'
    const isCompleted = talk.status === 'completed'
    const isAmendFlow = Boolean(body.amend) || isCompleted || isAmending

    if (isAmendFlow && (isCompleted || isAmending)) {
      const auth = await verifyAdminApiAccess()
      if (!auth.ok) return auth.response
    } else if (isDraft) {
      const auth = await verifyManagementAreaApiAccess()
      if (!auth.ok) return auth.response
    } else {
      return NextResponse.json({ error: 'This talk cannot be edited.' }, { status: 400 })
    }

    const { data: existingAttendees, error: attLoadErr } = await supabase
      .from('toolbox_talk_attendees')
      .select('id, worker_id, worker_name, worker_role, signature_path, signed_at')
      .eq('talk_id', talkId)

    if (attLoadErr) {
      return apiError('api/admin/toolbox-talks/[talkId] PATCH attendees', attLoadErr)
    }

    const existing = existingAttendees ?? []
    const existingWorkerIds = new Set(
      existing.map((a) => a.worker_id).filter(Boolean) as string[],
    )

    // ── Amend completed / continue amending: title/description + add-only ──
    if (isAmendFlow && (isCompleted || isAmending)) {
      const updates: Record<string, unknown> = {
        status: 'amending',
        manager_signature_path: null,
      }
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description

      if (attendeeIds) {
        const removals = [...existingWorkerIds].filter((id) => !attendeeIds.includes(id))
        if (removals.length > 0) {
          return NextResponse.json(
            { error: 'Existing attendees and signatures cannot be removed from a completed talk.' },
            { status: 400 },
          )
        }

        const toAdd = attendeeIds.filter((id) => !existingWorkerIds.has(id))
        if (toAdd.length > 0) {
          const { data: workers, error: wErr } = await supabase
            .from('workers')
            .select('id, first_name, surname, role, status')
            .in('id', toAdd)
            .eq('status', 'active')

          if (wErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH add workers', wErr)
          if (!workers || workers.length === 0) {
            return NextResponse.json({ error: 'No active workers found to add.' }, { status: 400 })
          }

          const { error: insErr } = await supabase.from('toolbox_talk_attendees').insert(
            workers.map((w) => ({
              talk_id: talkId,
              worker_id: w.id,
              worker_name: `${w.first_name} ${w.surname}`.trim(),
              worker_role: w.role,
            })),
          )
          if (insErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH insert', insErr)
        }
      }

      await removeStoragePath(supabase, talk.manager_signature_path)

      const { error: updErr } = await supabase
        .from('toolbox_talks')
        .update(updates)
        .eq('id', talkId)

      if (updErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH amend', updErr)
    } else {
      // ── Draft update: full title/description/attendee diff ──
      if (attendeeIds !== null && attendeeIds.length < 1) {
        return NextResponse.json({ error: 'Select at least one attendee.' }, { status: 400 })
      }

      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from('toolbox_talks')
          .update(updates)
          .eq('id', talkId)
        if (updErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH draft', updErr)
      }

      if (attendeeIds) {
        const toRemove = existing.filter(
          (a) => a.worker_id && !attendeeIds.includes(a.worker_id),
        )
        const toAdd = attendeeIds.filter((id) => !existingWorkerIds.has(id))

        for (const row of toRemove) {
          await removeStoragePath(supabase, row.signature_path)
          const { error: delErr } = await supabase
            .from('toolbox_talk_attendees')
            .delete()
            .eq('id', row.id)
          if (delErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH remove', delErr)
        }

        if (toAdd.length > 0) {
          const { data: workers, error: wErr } = await supabase
            .from('workers')
            .select('id, first_name, surname, role, status')
            .in('id', toAdd)
            .eq('status', 'active')

          if (wErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH draft workers', wErr)
          if (workers && workers.length > 0) {
            const { error: insErr } = await supabase.from('toolbox_talk_attendees').insert(
              workers.map((w) => ({
                talk_id: talkId,
                worker_id: w.id,
                worker_name: `${w.first_name} ${w.surname}`.trim(),
                worker_role: w.role,
              })),
            )
            if (insErr) return apiError('api/admin/toolbox-talks/[talkId] PATCH draft insert', insErr)
          }
        }
      }
    }

    const { data: refreshed } = await supabase
      .from('toolbox_talks')
      .select(`
        id, site_id, title, description, status, conducted_at,
        conducted_by_name, conducted_by_role, manager_signature_path,
        amendment_count, amended_at
      `)
      .eq('id', talkId)
      .single()

    const { data: attendees } = await supabase
      .from('toolbox_talk_attendees')
      .select('id, worker_id, worker_name, worker_role, signature_path, signed_at')
      .eq('talk_id', talkId)
      .order('worker_name')

    const { data: site } = await supabase
      .from('sites')
      .select('name')
      .eq('id', talk.site_id)
      .maybeSingle()

    return NextResponse.json({
      talk: mapTalkResponse(refreshed!, attendees ?? [], site?.name),
    })
  } catch (err) {
    return apiError('api/admin/toolbox-talks/[talkId] PATCH', err)
  }
}

/** DELETE — draft talks only. Completed talks are permanent. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { talkId } = await params
    const supabase = createServiceClient()

    const { data: talk } = await supabase
      .from('toolbox_talks')
      .select('id, status, site_id')
      .eq('id', talkId)
      .maybeSingle()

    if (!talk) return NextResponse.json({ error: 'Talk not found.' }, { status: 404 })

    if (talk.status === 'completed') {
      return NextResponse.json(
        { error: "Completed talks are a permanent record and can't be deleted." },
        { status: 400 },
      )
    }

    // Only full admins delete amending talks that were previously completed
    if (talk.status === 'amending') {
      if (auth.worker && !canAccessAdmin(auth.worker.role)) {
        return NextResponse.json(
          { error: "Completed talks are a permanent record and can't be deleted." },
          { status: 400 },
        )
      }
      // Don't allow deleting amending either — cancel amend by completing or leaving
      return NextResponse.json(
        { error: "Completed talks are a permanent record and can't be deleted. Finish or leave the amendment." },
        { status: 400 },
      )
    }

    if (talk.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft talks can be deleted.' }, { status: 400 })
    }

    await removeStorageFolder(supabase, talkId)

    const { error: delErr } = await supabase
      .from('toolbox_talks')
      .delete()
      .eq('id', talkId)

    if (delErr) return apiError('api/admin/toolbox-talks/[talkId] DELETE', delErr, 'Could not delete draft.')

    return NextResponse.json({ ok: true, siteId: talk.site_id })
  } catch (err) {
    return apiError('api/admin/toolbox-talks/[talkId] DELETE', err)
  }
}

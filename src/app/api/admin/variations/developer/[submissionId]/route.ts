import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { refreshSubmissionTotals } from '@/lib/variations/submission-totals'
import { DEVELOPER_ROLES } from '@/lib/variations/rates'

type ClaimLineUpdate = {
  id: string
  developer_hours: number
  developer_rate_per_hour: number
}

type ExtraLineUpdate = {
  id?: string
  worker_role: string
  developer_hours: number
  developer_rate_per_hour: number
}

function isTempExtraLineId(id: string | undefined): boolean {
  return !id || id.startsWith('temp-')
}

async function syncExtraLines(
  submissionId: string,
  extraLines: ExtraLineUpdate[]
) {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('variation_developer_lines')
    .select('id')
    .eq('developer_submission_id', submissionId)

  const keepIds = new Set(
    extraLines
      .map((l) => l.id)
      .filter((id): id is string => !!id && !isTempExtraLineId(id))
  )

  const toDelete = (existing ?? [])
    .map((l) => l.id)
    .filter((id) => !keepIds.has(id))

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('variation_developer_lines')
      .delete()
      .in('id', toDelete)
    if (error) throw new Error(error.message)
  }

  for (const line of extraLines) {
    if (!DEVELOPER_ROLES.includes(line.worker_role as typeof DEVELOPER_ROLES[number])) {
      throw new Error('Invalid worker role.')
    }
    if (line.developer_hours < 0 || line.developer_rate_per_hour < 0) {
      throw new Error('Hours and rates must be zero or greater.')
    }

    const payload = {
      worker_role:             line.worker_role,
      developer_hours:         line.developer_hours,
      developer_rate_per_hour: line.developer_rate_per_hour,
      updated_at:              new Date().toISOString(),
    }

    if (line.id && !isTempExtraLineId(line.id)) {
      const { error } = await supabase
        .from('variation_developer_lines')
        .update(payload)
        .eq('id', line.id)
        .eq('developer_submission_id', submissionId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('variation_developer_lines')
        .insert({
          developer_submission_id: submissionId,
          ...payload,
        })
      if (error) throw new Error(error.message)
    }
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { submissionId } = await params
    const supabase = createServiceClient()

    const { data: submission } = await supabase
      .from('variation_developer_submissions')
      .select('id, status')
      .eq('id', submissionId)
      .maybeSingle()

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
    }

    if (submission.status === 'agreed' || submission.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot delete — developer has already agreed.' },
        { status: 400 }
      )
    }

    const { data: linkedClaims } = await supabase
      .from('variation_claims')
      .select('id, status')
      .eq('developer_submission_id', submissionId)

    if (linkedClaims?.some((c) => c.status !== 'pending')) {
      return NextResponse.json(
        { error: 'Cannot delete — foreman variation is no longer pending.' },
        { status: 400 }
      )
    }

    await supabase
      .from('variation_claims')
      .update({
        developer_submission_id: null,
        developer_hours:         null,
        developer_rate_per_hour: null,
      })
      .eq('developer_submission_id', submissionId)

    const { error } = await supabase
      .from('variation_developer_submissions')
      .delete()
      .eq('id', submissionId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { submissionId } = await params
    const body = await request.json() as {
      lines?: ClaimLineUpdate[]
      extraLines?: ExtraLineUpdate[]
      material_uplift_enabled?: boolean
    }

    const supabase = createServiceClient()

    const { data: submission } = await supabase
      .from('variation_developer_submissions')
      .select('id, status')
      .eq('id', submissionId)
      .maybeSingle()

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
    }
    if (submission.status !== 'draft' && submission.status !== 'submitted') {
      return NextResponse.json({ error: 'Only draft or awaiting-agreement submissions can be edited.' }, { status: 400 })
    }

    if (body.lines?.length) {
      for (const line of body.lines) {
        if (line.developer_hours < 0 || line.developer_rate_per_hour < 0) {
          return NextResponse.json({ error: 'Hours and rates must be zero or greater.' }, { status: 400 })
        }

        const { error } = await supabase
          .from('variation_claims')
          .update({
            developer_hours:         line.developer_hours,
            developer_rate_per_hour: line.developer_rate_per_hour,
            updated_at:              new Date().toISOString(),
          })
          .eq('id', line.id)
          .eq('developer_submission_id', submissionId)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (body.extraLines !== undefined) {
      await syncExtraLines(submissionId, body.extraLines)
    }

    if (body.material_uplift_enabled !== undefined) {
      const { error } = await supabase
        .from('variation_developer_submissions')
        .update({
          material_uplift_enabled: body.material_uplift_enabled,
          updated_at:              new Date().toISOString(),
        })
        .eq('id', submissionId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { developerTotal, foremanTotal } = await refreshSubmissionTotals(submissionId)

    return NextResponse.json({
      success: true,
      developerTotal,
      foremanTotal,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

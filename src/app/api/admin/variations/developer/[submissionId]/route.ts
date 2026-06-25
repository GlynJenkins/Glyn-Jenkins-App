import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { lineTotal } from '@/lib/variations/developer'
import { refreshDeveloperSubmissionTotal } from '@/lib/variations/create-developer-submission'

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
      lines: { id: string; developer_hours: number; developer_rate_per_hour: number }[]
    }

    if (!body.lines?.length) {
      return NextResponse.json({ error: 'No lines provided.' }, { status: 400 })
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
    if (submission.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be edited.' }, { status: 400 })
    }

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

    const developerTotal = await refreshDeveloperSubmissionTotal(submissionId)

    const { data: claimLines } = await supabase
      .from('variation_claims')
      .select('hours, rate_per_hour, total_amount')
      .eq('developer_submission_id', submissionId)

    const computedForemanTotal = (claimLines ?? []).reduce(
      (sum, c) => sum + (c.total_amount ?? lineTotal(c.hours, c.rate_per_hour)),
      0
    )

    return NextResponse.json({
      success: true,
      developerTotal,
      foremanTotal: computedForemanTotal,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

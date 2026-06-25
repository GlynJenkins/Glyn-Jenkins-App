import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { refreshSubmissionTotals } from '@/lib/variations/submission-totals'

export async function POST(
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
    if (submission.status !== 'draft') {
      return NextResponse.json({ error: 'Already submitted to developer.' }, { status: 400 })
    }

    const { foremanTotal, developerTotal } = await refreshSubmissionTotals(submissionId)
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('variation_developer_submissions')
      .update({
        status:                    'submitted',
        foreman_total:             foremanTotal,
        developer_total:           developerTotal,
        submitted_to_developer_at: now,
        updated_at:                now,
      })
      .eq('id', submissionId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, developerTotal })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

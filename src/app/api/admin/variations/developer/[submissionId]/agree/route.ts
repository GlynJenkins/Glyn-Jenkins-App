import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

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
      .select('id, status, source, claim_mode')
      .eq('id', submissionId)
      .maybeSingle()

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
    }
    if (submission.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Developer variation must be submitted before it can be marked agreed.' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('variation_developer_submissions')
      .update({
        status:     'agreed',
        agreed_at:  now,
        updated_at: now,
      })
      .eq('id', submissionId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Management already set foreman pay at creation — approve it once developer agrees.
    if (submission.source === 'management' && submission.claim_mode === 'foreman_payable') {
      await supabase
        .from('variation_claims')
        .update({
          status:      'approved',
          approved_at: now,
          updated_at:  now,
        })
        .eq('developer_submission_id', submissionId)
        .eq('status', 'pending')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { submissionId } = await params
    const { payment_status } = await request.json() as { payment_status: 'paid' | 'unpaid' }

    if (!['paid', 'unpaid'].includes(payment_status)) {
      return NextResponse.json({ error: 'Invalid payment status.' }, { status: 400 })
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
    if (submission.status === 'draft' || submission.status === 'submitted') {
      return NextResponse.json({ error: 'Developer must agree before recording payment.' }, { status: 400 })
    }

    if (payment_status === 'paid') {
      const { data: full } = await supabase
        .from('variation_developer_submissions')
        .select('site_agent_signature_path')
        .eq('id', submissionId)
        .maybeSingle()

      if (!full?.site_agent_signature_path) {
        return NextResponse.json(
          { error: 'Site agent sign-off is required before marking paid. Capture signature on site first.' },
          { status: 400 }
        )
      }
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('variation_developer_submissions')
      .update({
        payment_status,
        status:     payment_status === 'paid' ? 'paid' : 'agreed',
        paid_at:    payment_status === 'paid' ? now : null,
        updated_at: now,
      })
      .eq('id', submissionId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, payment_status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

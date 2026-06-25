import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { ids, status, admin_rejection_reason } = await request.json() as {
      ids:                    string[]
      status:                 string
      admin_rejection_reason?: string
    }

    if (!ids?.length || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    if (status === 'approved') {
      const { data: claims } = await supabase
        .from('variation_claims')
        .select('id, developer_submission_id')
        .in('id', ids)

      const submissionIds = [
        ...new Set((claims ?? []).map((c) => c.developer_submission_id).filter(Boolean)),
      ] as string[]

      if (submissionIds.length > 1) {
        return NextResponse.json({ error: 'Invalid variation group.' }, { status: 400 })
      }

      if (submissionIds.length === 1) {
        const { data: submission } = await supabase
          .from('variation_developer_submissions')
          .select('status')
          .eq('id', submissionIds[0])
          .maybeSingle()

        if (!submission || submission.status !== 'agreed') {
          return NextResponse.json(
            {
              error: submission?.status === 'submitted'
                ? 'Developer must agree before you can approve the foreman variation.'
                : 'Complete the developer variation (submit and mark agreed) before approving the foreman.',
            },
            { status: 400 }
          )
        }
      }
    }

    const { error } = await supabase
      .from('variation_claims')
      .update({
        status,
        admin_rejection_reason: admin_rejection_reason ?? null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        updated_at:  new Date().toISOString(),
      })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

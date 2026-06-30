import { createServiceClient } from '@/lib/supabase/server'

export async function isReadyForDeveloperAgentSignOff(submissionId: string): Promise<boolean> {
  return (await signOffBlockedReason(submissionId)) === null
}

export async function signOffBlockedReason(submissionId: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('variation_developer_submissions')
    .select('id, status, claim_mode, site_agent_signature_path')
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return 'Variation not found.'
  if (submission.site_agent_signature_path) return 'Already signed off.'
  if (submission.status === 'draft' || submission.status === 'submitted') {
    return 'Developer must agree to the cost before sign-off.'
  }
  if (submission.status === 'paid') return 'Already marked paid.'
  if (submission.status !== 'agreed') return 'Variation is not ready for sign-off.'

  if (submission.claim_mode === 'company_profit') return null

  const { data: claims } = await supabase
    .from('variation_claims')
    .select('status')
    .eq('developer_submission_id', submissionId)

  if (!claims?.length) return 'No foreman pay line linked.'
  if (!claims.every((c) => c.status === 'approved')) {
    return 'Approve the foreman lump sum before sign-off (work authorised).'
  }

  return null
}

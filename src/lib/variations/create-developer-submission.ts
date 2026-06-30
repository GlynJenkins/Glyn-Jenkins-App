import { createServiceClient } from '@/lib/supabase/server'
import { computeDeveloperTotals } from '@/lib/variations/developer'
import { allocateNextVoNumber } from '@/lib/variations/vo-reference'

type ClaimRow = {
  id: string
  site_id: string
  foreman_id: string
  description: string
  photo_urls: string[] | null
  hours: number
  rate_per_hour: number
  total_amount: number | null
  status: string
  developer_submission_id: string | null
}

export async function createDeveloperSubmissionForClaims(ids: string[]): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: claims, error } = await supabase
    .from('variation_claims')
    .select('id, site_id, foreman_id, description, photo_urls, hours, rate_per_hour, total_amount, status, developer_submission_id')
    .in('id', ids)

  if (error || !claims?.length) return null

  const rows = claims as ClaimRow[]

  if (rows.some((c) => c.developer_submission_id)) return null
  if (rows.some((c) => c.status !== 'pending')) return null

  const first = rows[0]
  const submissionKey = (first.photo_urls ?? [])[0] ?? first.id
  const foremanTotal = rows.reduce((sum, c) => sum + (c.total_amount ?? c.hours * c.rate_per_hour), 0)
  const voNumber = await allocateNextVoNumber(supabase, first.site_id)

  const { data: submission, error: subErr } = await supabase
    .from('variation_developer_submissions')
    .insert({
      submission_key: submissionKey,
      site_id:        first.site_id,
      foreman_id:     first.foreman_id,
      description:    first.description,
      photo_urls:     first.photo_urls ?? [],
      status:         'draft',
      foreman_total:  foremanTotal,
      developer_total: foremanTotal,
      payment_status: 'unpaid',
      vo_number:      voNumber,
    })
    .select('id')
    .single()

  if (subErr || !submission) {
    console.error('[variations] developer submission create failed:', subErr?.message)
    return null
  }

  for (const claim of rows) {
    await supabase
      .from('variation_claims')
      .update({
        developer_submission_id:  submission.id,
        developer_hours:          claim.hours,
        developer_rate_per_hour:  claim.rate_per_hour,
      })
      .eq('id', claim.id)
  }

  return submission.id
}

export async function refreshDeveloperSubmissionTotal(submissionId: string) {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('variation_developer_submissions')
    .select('material_uplift_enabled')
    .eq('id', submissionId)
    .maybeSingle()

  const { data: claimLines } = await supabase
    .from('variation_claims')
    .select('developer_hours, developer_rate_per_hour')
    .eq('developer_submission_id', submissionId)

  const { data: extraLines } = await supabase
    .from('variation_developer_lines')
    .select('developer_hours, developer_rate_per_hour')
    .eq('developer_submission_id', submissionId)

  const { developerTotal } = computeDeveloperTotals(
    claimLines ?? [],
    extraLines ?? [],
    submission?.material_uplift_enabled ?? false
  )

  await supabase
    .from('variation_developer_submissions')
    .update({
      developer_total: developerTotal,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', submissionId)

  return developerTotal
}

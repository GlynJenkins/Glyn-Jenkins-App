import { createServiceClient } from '@/lib/supabase/server'
import { lineTotal } from '@/lib/variations/developer'

export function variationProfit(developerTotal: number, foremanTotal: number): number {
  return Math.round((developerTotal - foremanTotal) * 100) / 100
}

export async function refreshForemanSubmissionTotal(submissionId: string): Promise<number> {
  const supabase = createServiceClient()

  const { data: claimLines } = await supabase
    .from('variation_claims')
    .select('hours, rate_per_hour, total_amount')
    .eq('developer_submission_id', submissionId)

  const foremanTotal = (claimLines ?? []).reduce(
    (sum, c) => sum + (c.total_amount ?? lineTotal(c.hours, c.rate_per_hour)),
    0
  )

  await supabase
    .from('variation_developer_submissions')
    .update({
      foreman_total: foremanTotal,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', submissionId)

  return foremanTotal
}

export async function refreshSubmissionTotals(submissionId: string) {
  const { refreshDeveloperSubmissionTotal } = await import('@/lib/variations/create-developer-submission')
  const foremanTotal = await refreshForemanSubmissionTotal(submissionId)
  const developerTotal = await refreshDeveloperSubmissionTotal(submissionId)
  return {
    foremanTotal,
    developerTotal,
    profit: variationProfit(developerTotal, foremanTotal),
  }
}

export type DeveloperRegisterRow = {
  id: string
  siteName: string
  description: string
  foremanTotal: number
  developerTotal: number
  profit: number
  paymentStatus: string
  status: string
  submittedAt: string | null
  foremanName: string
}

export async function loadDeveloperRegisterRows(): Promise<DeveloperRegisterRow[]> {
  const supabase = createServiceClient()

  const { data: submissions } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, payment_status,
      foreman_total, developer_total,
      submitted_to_developer_at, foreman_id,
      sites ( name )
    `)
    .neq('status', 'draft')
    .order('submitted_to_developer_at', { ascending: false, nullsFirst: false })

  const rows: DeveloperRegisterRow[] = []

  for (const s of submissions ?? []) {
    const site = Array.isArray(s.sites) ? s.sites[0] : s.sites
    const { data: foreman } = await supabase
      .from('workers')
      .select('first_name, surname')
      .eq('id', s.foreman_id)
      .maybeSingle()

    rows.push({
      id:              s.id,
      siteName:        site?.name ?? 'Unknown site',
      description:     s.description,
      foremanTotal:    Number(s.foreman_total),
      developerTotal:  Number(s.developer_total),
      profit:          variationProfit(Number(s.developer_total), Number(s.foreman_total)),
      paymentStatus:   s.payment_status,
      status:          s.status,
      submittedAt:     s.submitted_to_developer_at,
      foremanName:     foreman ? `${foreman.first_name} ${foreman.surname}` : 'Unknown',
    })
  }

  return rows
}

import { createServiceClient } from '@/lib/supabase/server'
import { lineTotal } from '@/lib/variations/developer'
import { formatVariationReference } from '@/lib/variations/vo-reference'

export function variationProfit(developerTotal: number, foremanTotal: number): number {
  return Math.round((developerTotal - foremanTotal) * 100) / 100
}

export async function refreshForemanSubmissionTotal(submissionId: string): Promise<number> {
  const supabase = createServiceClient()

  const { data: submission } = await supabase
    .from('variation_developer_submissions')
    .select('foreman_lump_sum, source')
    .eq('id', submissionId)
    .maybeSingle()

  if (submission?.source === 'management' && submission.foreman_lump_sum != null) {
    const foremanTotal = Number(submission.foreman_lump_sum)
    await supabase
      .from('variation_developer_submissions')
      .update({ foreman_total: foremanTotal, updated_at: new Date().toISOString() })
      .eq('id', submissionId)
    return foremanTotal
  }

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
  reference: string
  siteId: string
  siteCode: string | null
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

  const fullSelect = `
      id, description, status, payment_status, site_id,
      foreman_total, developer_total, vo_number,
      submitted_to_developer_at, foreman_id, assigned_foreman_id, source, claim_mode,
      sites ( name, site_code )
    `
  const legacySelect = `
      id, description, status, payment_status, site_id,
      foreman_total, developer_total, vo_number,
      submitted_to_developer_at, foreman_id,
      sites ( name, site_code )
    `

  let submissions: Record<string, unknown>[] | null = null

  const full = await supabase
    .from('variation_developer_submissions')
    .select(fullSelect)
    .neq('status', 'draft')
    .order('submitted_to_developer_at', { ascending: false, nullsFirst: false })

  submissions = full.data
  if (full.error) {
    const legacy = await supabase
      .from('variation_developer_submissions')
      .select(legacySelect)
      .neq('status', 'draft')
      .order('submitted_to_developer_at', { ascending: false, nullsFirst: false })
    submissions = legacy.data
  }

  const rows: DeveloperRegisterRow[] = []

  for (const s of submissions ?? []) {
    const site = Array.isArray(s.sites) ? s.sites[0] : s.sites
    const foremanId = (s.assigned_foreman_id ?? s.foreman_id) as string | null
    const source = s.source as string | undefined
    const claimMode = s.claim_mode as string | undefined
    let foremanName = 'Unknown'
    if (source === 'management' && claimMode === 'company_profit') {
      foremanName = 'Company profit'
    } else if (source === 'management' && !foremanId) {
      foremanName = 'Any foreman'
    } else if (foremanId) {
      const { data: foreman } = await supabase
        .from('workers')
        .select('first_name, surname')
        .eq('id', foremanId)
        .maybeSingle()
      foremanName = foreman ? `${foreman.first_name} ${foreman.surname}` : 'Unknown'
    }

    rows.push({
      id:              s.id as string,
      reference:       formatVariationReference(site?.site_code, s.vo_number as number | null),
      siteId:          s.site_id as string,
      siteCode:        site?.site_code ?? null,
      siteName:        site?.name ?? 'Unknown site',
      description:     s.description as string,
      foremanTotal:    Number(s.foreman_total),
      developerTotal:  Number(s.developer_total),
      profit:          variationProfit(Number(s.developer_total), Number(s.foreman_total)),
      paymentStatus:   s.payment_status as string,
      status:          s.status as string,
      submittedAt:     s.submitted_to_developer_at as string | null,
      foremanName,
    })
  }

  return rows
}

export type DeveloperInProgressRow = {
  id:             string
  reference:      string
  siteName:       string
  description:    string
  status:         string
  foremanTotal:   number
  developerTotal: number
  foremanName:    string
  updatedAt:      string
}

/** Drafts and pre-register submissions — hidden from VO register until sent to developer. */
export async function loadDeveloperInProgressRows(): Promise<DeveloperInProgressRow[]> {
  const supabase = createServiceClient()

  const fullSelect = `
      id, description, status,
      foreman_total, developer_total, vo_number,
      updated_at, foreman_id, assigned_foreman_id, source, claim_mode,
      sites ( name, site_code )
    `
  const legacySelect = `
      id, description, status,
      foreman_total, developer_total, vo_number,
      updated_at, foreman_id,
      sites ( name, site_code )
    `

  let submissions: Record<string, unknown>[] | null = null

  const full = await supabase
    .from('variation_developer_submissions')
    .select(fullSelect)
    .in('status', ['draft', 'submitted', 'agreed'])
    .order('updated_at', { ascending: false })

  submissions = full.data
  if (full.error) {
    const legacy = await supabase
      .from('variation_developer_submissions')
      .select(legacySelect)
      .in('status', ['draft', 'submitted', 'agreed'])
      .order('updated_at', { ascending: false })
    submissions = legacy.data
  }

  const rows: DeveloperInProgressRow[] = []

  for (const s of submissions ?? []) {
    const site = Array.isArray(s.sites) ? s.sites[0] : s.sites
    const foremanId = (s.assigned_foreman_id ?? s.foreman_id) as string | null
    const source = s.source as string | undefined
    const claimMode = s.claim_mode as string | undefined
    let foremanName = 'Unknown'
    if (source === 'management' && claimMode === 'company_profit') {
      foremanName = 'Company profit'
    } else if (source === 'management' && !foremanId) {
      foremanName = 'Any foreman'
    } else if (foremanId) {
      const { data: foreman } = await supabase
        .from('workers')
        .select('first_name, surname')
        .eq('id', foremanId)
        .maybeSingle()
      foremanName = foreman ? `${foreman.first_name} ${foreman.surname}` : 'Unknown'
    }

    rows.push({
      id:             s.id as string,
      reference:      formatVariationReference(site?.site_code, s.vo_number as number | null),
      siteName:       site?.name ?? 'Unknown site',
      description:    s.description as string,
      status:         s.status as string,
      foremanTotal:   Number(s.foreman_total),
      developerTotal: Number(s.developer_total),
      foremanName,
      updatedAt:      s.updated_at as string,
    })
  }

  return rows
}

import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import { formatVariationReference } from '@/lib/variations/vo-reference'

export type SiteSignOffRow = {
  id:                string
  reference:         string
  description:       string
  status:            string
  developerTotal:    number
  siteAgentName:     string | null
  siteAgentSignedAt: string | null
  signed:            boolean
  readyForSignOff:   boolean
  blockedReason:     string | null
}

export type SiteSignOffSiteSummary = {
  siteId:        string
  siteName:      string
  pendingCount:  number
  waitingCount:  number
  signedCount:   number
}

type SignOffSubmissionRow = {
  id:                         string
  description:                string
  status:                     string
  developer_total:            number | null
  vo_number:                  number | null
  claim_mode?:                string | null
  site_agent_name?:           string | null
  site_agent_signed_at?:      string | null
  site_agent_signature_path?: string | null
  sites:                      { site_code: string | null } | { site_code: string | null }[] | null
}

async function loadSignOffSubmissions(siteId: string): Promise<SignOffSubmissionRow[]> {
  const supabase = createServiceClient()

  const full = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, developer_total, vo_number, claim_mode,
      site_agent_name, site_agent_signed_at, site_agent_signature_path,
      sites ( site_code )
    `)
    .eq('site_id', siteId)
    .in('status', ['draft', 'submitted', 'agreed', 'paid'])
    .order('created_at', { ascending: false })

  if (!full.error) return (full.data ?? []) as SignOffSubmissionRow[]

  const legacy = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, developer_total, vo_number,
      sites ( site_code )
    `)
    .eq('site_id', siteId)
    .in('status', ['draft', 'submitted', 'agreed', 'paid'])
    .order('created_at', { ascending: false })

  if (legacy.error) return []
  return (legacy.data ?? []) as SignOffSubmissionRow[]
}

async function foremanApprovedBySubmission(
  submissionIds: string[],
  hasClaimMode: boolean
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  if (!submissionIds.length) return map

  const supabase = createServiceClient()

  const companyProfit = new Set<string>()
  if (hasClaimMode) {
    const { data: submissions } = await supabase
      .from('variation_developer_submissions')
      .select('id, claim_mode')
      .in('id', submissionIds)

    for (const s of submissions ?? []) {
      if (s.claim_mode === 'company_profit') companyProfit.add(s.id)
    }
  }

  for (const id of submissionIds) {
    if (companyProfit.has(id)) map.set(id, true)
  }

  const needClaims = submissionIds.filter((id) => !companyProfit.has(id))
  if (!needClaims.length) return map

  const { data: claims } = await supabase
    .from('variation_claims')
    .select('developer_submission_id, status')
    .in('developer_submission_id', needClaims)

  const bySubmission = new Map<string, string[]>()
  for (const c of claims ?? []) {
    if (!c.developer_submission_id) continue
    const list = bySubmission.get(c.developer_submission_id) ?? []
    list.push(c.status)
    bySubmission.set(c.developer_submission_id, list)
  }

  for (const id of needClaims) {
    const statuses = bySubmission.get(id)
    map.set(id, !!statuses?.length && statuses.every((s) => s === 'approved'))
  }

  return map
}

function blockedReasonForRow(
  status: string,
  signed: boolean,
  foremanApproved: boolean,
  claimMode: string
): string | null {
  if (signed) return null
  if (status === 'draft' || status === 'submitted') return 'Waiting for developer to agree cost.'
  if (status === 'paid') return null
  if (status !== 'agreed') return 'Not ready for sign-off.'
  if (claimMode === 'company_profit') return null
  if (!foremanApproved) return 'Approve foreman pay first (authorise work).'
  return null
}

export async function loadSiteSignOffQueue(siteId: string): Promise<SiteSignOffRow[]> {
  const data = await loadSignOffSubmissions(siteId)
  if (!data.length) return []

  const hasClaimMode = data.some((r) => r.claim_mode != null)
  const hasSignOffColumns = data.some((r) => 'site_agent_signature_path' in r)

  const ids = data.map((r) => r.id)
  const foremanApproved = await foremanApprovedBySubmission(ids, hasClaimMode)

  return data.map((row) => {
    const site = relationOne(row.sites)
    const reference = formatVariationReference(site?.site_code, row.vo_number)
    const signed = hasSignOffColumns ? !!row.site_agent_signature_path : false
    const approved = foremanApproved.get(row.id) ?? false
    const claimMode = (row.claim_mode as string) ?? 'foreman_payable'
    const readyForSignOff = row.status === 'agreed' && approved && !signed

    return {
      id:                row.id,
      reference:         reference !== '—' ? reference : row.id.slice(0, 8).toUpperCase(),
      description:       row.description,
      status:            row.status,
      developerTotal:    row.developer_total ?? 0,
      siteAgentName:     hasSignOffColumns ? (row.site_agent_name ?? null) : null,
      siteAgentSignedAt: hasSignOffColumns ? (row.site_agent_signed_at ?? null) : null,
      signed,
      readyForSignOff,
      blockedReason:     blockedReasonForRow(row.status, signed, approved, claimMode),
    }
  })
}

export async function countPendingSiteSignOffs(siteId: string): Promise<number> {
  const rows = await loadSiteSignOffQueue(siteId)
  return rows.filter((r) => r.readyForSignOff).length
}

export async function loadSiteSignOffSiteSummaries(): Promise<SiteSignOffSiteSummary[]> {
  const supabase = createServiceClient()

  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) return []

  const summaries: SiteSignOffSiteSummary[] = []

  for (const site of sites ?? []) {
    const rows = await loadSiteSignOffQueue(site.id)
    const pendingCount = rows.filter((r) => r.readyForSignOff).length
    const waitingCount = rows.filter((r) => !r.signed && !r.readyForSignOff).length
    const signedCount  = rows.filter((r) => r.signed).length
    if (pendingCount > 0 || signedCount > 0 || waitingCount > 0) {
      summaries.push({
        siteId:       site.id,
        siteName:     site.name,
        pendingCount,
        waitingCount,
        signedCount,
      })
    }
  }

  return summaries.sort((a, b) => b.pendingCount - a.pendingCount || a.siteName.localeCompare(b.siteName))
}

import { createServiceClient } from '@/lib/supabase/server'
import { relationOne } from '@/lib/supabase/normalize-relations'
import {
  loadCompanyBranding,
  parseSiteDocumentDetails,
  type CompanyBranding,
  type SiteDocumentDetails,
} from '@/lib/documents/company-branding'
import { computeDeveloperTotals, lineTotal } from '@/lib/variations/developer'
import { ROLE_LABELS } from '@/lib/variations/rates'
import { formatVariationReference } from '@/lib/variations/vo-reference'

export type DeveloperVariationPdfLine = {
  roleLabel: string
  hours: number
  rate: number
  total: number
}

export type DeveloperVariationPdfData = {
  reference: string
  siteName: string
  siteCode: string | null
  siteDocuments: SiteDocumentDetails
  company: CompanyBranding
  description: string
  preparedAt: Date
  submittedAt: Date | null
  status: string
  lines: DeveloperVariationPdfLine[]
  materialUpliftEnabled: boolean
  workersSubtotal: number
  materialUpliftAmount: number
  developerTotal: number
}

function roleLabel(workerRole: string | null, workerJoinRole: string | null) {
  const role = workerRole ?? workerJoinRole ?? ''
  return (ROLE_LABELS[role] ?? role) || 'Worker'
}

export async function loadDeveloperVariationPdfData(
  submissionId: string
): Promise<DeveloperVariationPdfData | null> {
  const supabase = createServiceClient()
  const company = await loadCompanyBranding()

  const { data: submission } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, material_uplift_enabled, vo_number,
      created_at, submitted_to_developer_at,
      sites (
        name, site_code,
        document_address, developer_name, developer_contact,
        surveyor_name, document_reference
      )
    `)
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return null

  const { data: claimLines } = await supabase
    .from('variation_claims')
    .select(`
      worker_role, developer_hours, developer_rate_per_hour, hours, rate_per_hour,
      workers!variation_claims_worker_id_fkey ( role )
    `)
    .eq('developer_submission_id', submissionId)
    .order('created_at')

  const { data: extraLines } = await supabase
    .from('variation_developer_lines')
    .select('worker_role, developer_hours, developer_rate_per_hour')
    .eq('developer_submission_id', submissionId)
    .order('created_at')

  const site = relationOne(submission.sites)

  const pdfLines: DeveloperVariationPdfLine[] = []

  for (const line of claimLines ?? []) {
    const worker = relationOne(line.workers as { role: string } | { role: string }[] | null)
    const hours = line.developer_hours ?? line.hours
    const rate = line.developer_rate_per_hour ?? line.rate_per_hour
    pdfLines.push({
      roleLabel: roleLabel(line.worker_role, worker?.role ?? null),
      hours,
      rate,
      total: lineTotal(hours, rate),
    })
  }

  for (const line of extraLines ?? []) {
    pdfLines.push({
      roleLabel: roleLabel(line.worker_role, null),
      hours: line.developer_hours,
      rate: line.developer_rate_per_hour,
      total: lineTotal(line.developer_hours, line.developer_rate_per_hour),
    })
  }

  const totals = computeDeveloperTotals(
    (claimLines ?? []).map((l) => ({
      developer_hours:         l.developer_hours ?? l.hours,
      developer_rate_per_hour: l.developer_rate_per_hour ?? l.rate_per_hour,
    })),
    extraLines ?? [],
    submission.material_uplift_enabled ?? false
  )

  const reference = formatVariationReference(site?.site_code, submission.vo_number)

  return {
    reference:             reference !== '—' ? reference : submission.id.slice(0, 8).toUpperCase(),
    siteName:              site?.name ?? 'Unknown site',
    siteCode:              site?.site_code ?? null,
    siteDocuments:         parseSiteDocumentDetails(site),
    company,
    description:           submission.description,
    preparedAt:            new Date(submission.created_at),
    submittedAt:           submission.submitted_to_developer_at
      ? new Date(submission.submitted_to_developer_at)
      : null,
    status:                submission.status,
    lines:                 pdfLines,
    materialUpliftEnabled: submission.material_uplift_enabled ?? false,
    workersSubtotal:       totals.workersSubtotal,
    materialUpliftAmount:  totals.materialUpliftAmount,
    developerTotal:        totals.developerTotal,
  }
}

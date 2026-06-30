import { createServiceClient } from '@/lib/supabase/server'
import { allocateNextVoNumber } from '@/lib/variations/vo-reference'

export type ManagementVariationInput = {
  siteId:             string
  description:        string
  plotNumbers:        string[]
  claimMode:          'foreman_payable' | 'company_profit'
  foremanLumpSum:     number | null
  assignedForemanId:  string | null
  developerTotal:     number
  materialUplift:     boolean
  photoPaths:         string[]
  createdByWorkerId:  string | null
}

function parsePlotNumbers(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function normalizePlotNumbers(input: string | string[]): string[] {
  if (Array.isArray(input)) return input.map((p) => p.trim()).filter(Boolean)
  return parsePlotNumbers(input)
}

export function lumpSumLabel(plotNumbers: string[]): string {
  if (!plotNumbers.length) return 'Lump sum'
  return `Lump sum — Plots ${plotNumbers.join(', ')}`
}

/** Foreman pay must differ from developer charge (margin on management VOs). */
export function validateForemanPayVsDeveloper(
  foremanPay: number,
  developerTotal: number
): string | null {
  if (foremanPay <= 0) return 'Enter a foreman pay amount greater than zero.'
  if (Math.abs(foremanPay - developerTotal) < 0.005) {
    return 'Foreman pay must be different from the developer charge — the difference is company margin.'
  }
  if (foremanPay > developerTotal) {
    return 'Foreman pay cannot exceed the developer charge.'
  }
  return null
}

export async function createManagementDeveloperSubmission(
  input: ManagementVariationInput
): Promise<{ id: string } | { error: string }> {
  const supabase = createServiceClient()

  if (!input.siteId || !input.description.trim()) {
    return { error: 'Site and description are required.' }
  }
  if (input.developerTotal <= 0) {
    return { error: 'Enter a developer charge greater than zero.' }
  }
  if (input.claimMode === 'foreman_payable') {
    const payError = validateForemanPayVsDeveloper(input.foremanLumpSum ?? 0, input.developerTotal)
    if (payError) return { error: payError }
  }

  const voNumber = await allocateNextVoNumber(supabase, input.siteId)
  const submissionKey = `mgmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const foremanTotal = input.claimMode === 'company_profit' ? 0 : (input.foremanLumpSum ?? 0)

  const { data: submission, error: subErr } = await supabase
    .from('variation_developer_submissions')
    .insert({
      submission_key:          submissionKey,
      site_id:                 input.siteId,
      foreman_id:              input.assignedForemanId,
      description:             input.description.trim(),
      photo_urls:              input.photoPaths,
      status:                  'draft',
      source:                  'management',
      claim_mode:              input.claimMode,
      plot_numbers:            input.plotNumbers,
      foreman_lump_sum:         foremanTotal,
      assigned_foreman_id:     input.assignedForemanId,
      created_by:              input.createdByWorkerId,
      foreman_total:           foremanTotal,
      developer_total:         input.developerTotal,
      material_uplift_enabled: input.materialUplift,
      payment_status:          'unpaid',
      vo_number:               voNumber,
    })
    .select('id')
    .single()

  if (subErr || !submission) {
    return { error: subErr?.message ?? 'Could not create variation.' }
  }

  if (input.claimMode === 'foreman_payable' && foremanTotal > 0) {
    const { error: claimErr } = await supabase.from('variation_claims').insert({
      site_id:                 input.siteId,
      foreman_id:              input.assignedForemanId,
      worker_id:               null,
      worker_role:             'labourer',
      hours:                   0,
      rate_per_hour:           0,
      total_amount:            foremanTotal,
      description:             input.description.trim(),
      photo_urls:              input.photoPaths,
      status:                  'pending',
      developer_submission_id: submission.id,
      is_lump_sum:             true,
      lump_sum_label:          input.description.trim(),
      assigned_foreman_id:     input.assignedForemanId,
    })

    if (claimErr) {
      await supabase.from('variation_developer_submissions').delete().eq('id', submission.id)
      return { error: claimErr.message }
    }
  }

  return { id: submission.id }
}

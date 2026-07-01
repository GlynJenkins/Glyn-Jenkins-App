import { createServiceClient } from '@/lib/supabase/server'
import { VARIATION_RATES } from '@/lib/variations/rates'

const ALLOWED_ROLES = Object.keys(VARIATION_RATES)

export type AdminVariationWorkerInput = {
  workerId: string
  workerRole: string
  hours: number
}

export type CreateAdminVariationInput = {
  siteId: string
  description: string
  assignedForemanId: string | null
  payType: 'lump_sum' | 'daywork'
  lumpSumAmount?: number
  workers?: AdminVariationWorkerInput[]
  photoPath: string | null
  createdByWorkerId: string | null
}

function groupKey(siteId: string, photoPath: string | null): string {
  return photoPath ?? `variations/admin/${siteId}/${Date.now()}-${crypto.randomUUID()}`
}

export async function createAdminVariation(input: CreateAdminVariationInput) {
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const photoGroup = groupKey(input.siteId, input.photoPath)
  const photoUrls = [photoGroup]

  const base = {
    site_id:      input.siteId,
    description:  input.description.trim(),
    photo_urls:   photoUrls,
    status:       'approved' as const,
    approved_at:  now,
    foreman_id:   input.assignedForemanId,
    assigned_foreman_id: input.assignedForemanId,
  }

  let records: Record<string, unknown>[]

  if (input.payType === 'lump_sum') {
    const amount = input.lumpSumAmount ?? 0
    records = [{
      ...base,
      worker_id:     null,
      worker_role:   null,
      hours:         1,
      rate_per_hour: amount,
      is_lump_sum:   true,
      lump_sum_label: 'Agreed foreman pay',
    }]
  } else {
    records = (input.workers ?? []).map(({ workerId, workerRole, hours }) => ({
      ...base,
      worker_id:     workerId,
      worker_role:   workerRole,
      hours,
      rate_per_hour: VARIATION_RATES[workerRole as keyof typeof VARIATION_RATES],
      is_lump_sum:   false,
    }))
  }

  const { error } = await supabase.from('variation_claims').insert(records)

  if (error?.message.includes('is_lump_sum') || error?.message.includes('assigned_foreman_id')) {
    const legacyRecords = records.map(({ is_lump_sum, assigned_foreman_id, lump_sum_label, ...rest }) => rest)
    const legacy = await supabase.from('variation_claims').insert(legacyRecords)
    if (legacy.error) throw new Error(legacy.error.message)
    return { lineCount: legacyRecords.length }
  }

  if (error) throw new Error(error.message)

  return { lineCount: records.length }
}

export function validateAdminVariationPayload(body: {
  siteId?: string
  description?: string
  assignedForemanId?: string | null
  payType?: string
  lumpSumAmount?: number
  workers?: AdminVariationWorkerInput[]
}): string | null {
  if (!body.siteId?.trim()) return 'Select a site.'
  if (!body.description?.trim()) return 'Description is required.'
  if (body.payType !== 'lump_sum' && body.payType !== 'daywork') return 'Select a pay type.'

  if (body.payType === 'lump_sum') {
    if (typeof body.lumpSumAmount !== 'number' || body.lumpSumAmount <= 0) {
      return 'Enter a valid lump sum amount.'
    }
    return null
  }

  if (!body.workers?.length) return 'Add at least one worker line.'
  for (const entry of body.workers) {
    if (!entry.workerId) return 'Select a worker for each line.'
    if (!ALLOWED_ROLES.includes(entry.workerRole)) return 'Invalid worker role.'
    if (typeof entry.hours !== 'number' || entry.hours <= 0) return 'Enter valid hours for each worker.'
  }
  return null
}

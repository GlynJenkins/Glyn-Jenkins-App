import type { SupabaseClient } from '@supabase/supabase-js'
import { relationOne } from '@/lib/supabase/normalize-relations'

export type WorkerPayDiagnostics = {
  approvedGross:              number
  approvedAllocationCount:    number
  pendingGross:               number
  pendingAllocationCount:     number
  approvedClaimsAsForeman:    number
  foremanClaimsWithoutPay:    number
  duplicateNameMatches:       { id: string; first_name: string; surname: string; role: string }[]
}

type ClaimRef = {
  status: string
  foreman_id: string | null
}

type AllocationRow = {
  gross_amount: number | null
  claim_period_id?: string
  claim_periods: ClaimRef | ClaimRef[] | null
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export async function fetchWorkerPayDiagnostics(
  supabase: SupabaseClient,
  worker: { id: string; first_name: string; surname: string },
): Promise<WorkerPayDiagnostics> {
  const { data: allocations } = await supabase
    .from('claim_allocations')
    .select(`
      gross_amount,
      claim_period_id,
      claim_periods ( status, foreman_id )
    `)
    .eq('worker_id', worker.id)

  const rows = (allocations ?? []) as AllocationRow[]

  let approvedGross = 0
  let approvedAllocationCount = 0
  let pendingGross = 0
  let pendingAllocationCount = 0
  const paidClaimIds = new Set<string>()

  for (const row of rows) {
    const claim = relationOne(row.claim_periods)
    const gross = row.gross_amount ?? 0
    if (!claim || gross <= 0) continue

    if (claim.status === 'approved') {
      approvedGross += gross
      approvedAllocationCount++
      if (row.claim_period_id) paidClaimIds.add(row.claim_period_id)
    } else if (claim.status === 'pending') {
      pendingGross += gross
      pendingAllocationCount++
    }
  }

  const { data: foremanClaims } = await supabase
    .from('claim_periods')
    .select('id')
    .eq('foreman_id', worker.id)
    .eq('status', 'approved')

  const approvedClaimIds = (foremanClaims ?? []).map((c) => c.id)
  const foremanClaimsWithoutPay = approvedClaimIds.filter((id) => !paidClaimIds.has(id)).length

  const { data: duplicates } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .ilike('first_name', worker.first_name.trim())
    .ilike('surname', worker.surname.trim())
    .neq('id', worker.id)

  return {
    approvedGross:           roundMoney(approvedGross),
    approvedAllocationCount,
    pendingGross:            roundMoney(pendingGross),
    pendingAllocationCount,
    approvedClaimsAsForeman: approvedClaimIds.length,
    foremanClaimsWithoutPay,
    duplicateNameMatches:    duplicates ?? [],
  }
}

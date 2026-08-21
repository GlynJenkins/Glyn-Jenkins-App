import type { SupabaseClient } from '@supabase/supabase-js'

type RpcResult = {
  ok: boolean
  error?: string
  remaining?: number
  claimed_value?: number
  total_claimed_pct?: number
}

function parseRpc(data: unknown): RpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Unexpected claim RPC response' }
  }
  const row = data as RpcResult
  return {
    ok: Boolean(row.ok),
    error: typeof row.error === 'string' ? row.error : undefined,
    remaining: typeof row.remaining === 'number' ? row.remaining : undefined,
    claimed_value: typeof row.claimed_value === 'number' ? row.claimed_value : undefined,
    total_claimed_pct:
      typeof row.total_claimed_pct === 'number' ? row.total_claimed_pct : undefined,
  }
}

/** Atomically add claim money to a price_grid cell (FOR UPDATE inside RPC). */
export async function applyPriceGridClaim(
  supabase: SupabaseClient,
  cellId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('apply_price_grid_claim', {
    p_cell_id: cellId,
    p_amount:  amount,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('function') && error.message.includes('does not exist')
          ? 'Database update needed: run supabase/migrations/price_grid_claimed_value.sql'
          : error.message,
    }
  }
  const result = parseRpc(data)
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.remaining != null
          ? `${result.error ?? 'Insufficient remaining value'} (£${Number(result.remaining).toFixed(2)} left)`
          : result.error ?? 'Could not apply claim to grid cell',
    }
  }
  return { ok: true }
}

/** Atomically release claim money from a price_grid cell. */
export async function releasePriceGridClaim(
  supabase: SupabaseClient,
  cellId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('release_price_grid_claim', {
    p_cell_id: cellId,
    p_amount:  amount,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('function') && error.message.includes('does not exist')
          ? 'Database update needed: run supabase/migrations/price_grid_claimed_value.sql'
          : error.message,
    }
  }
  const result = parseRpc(data)
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Could not release claim from grid cell' }
  }
  return { ok: true }
}

/** Prefer claimed_value (money); fall back to %-of-contract for pre-migration rows. */
export function cellClaimedMoney(cell: {
  contract_value?: number | null
  total_claimed_pct?: number | null
  claimed_value?: number | null
}): number {
  if (typeof cell.claimed_value === 'number' && Number.isFinite(cell.claimed_value)) {
    return Math.max(0, cell.claimed_value)
  }
  const contract = cell.contract_value ?? 0
  const pct = Math.min(100, Math.max(0, cell.total_claimed_pct ?? 0))
  return Math.round(contract * pct) / 100
}

export function cellRemainingMoney(cell: {
  contract_value?: number | null
  total_claimed_pct?: number | null
  claimed_value?: number | null
}): number {
  const contract = cell.contract_value ?? 0
  return Math.max(0, Math.round((contract - cellClaimedMoney(cell)) * 100) / 100)
}

import { NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { syncMissingCisLedger } from '@/lib/cis/ledger-sync'

export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const result = await syncMissingCisLedger(supabase)

  if (result.errors.length) {
    return NextResponse.json(
      {
        success: result.inserted > 0,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
      },
      { status: result.inserted > 0 ? 207 : 500 },
    )
  }

  return NextResponse.json({
    success: true,
    inserted: result.inserted,
    skipped: result.skipped,
  })
}

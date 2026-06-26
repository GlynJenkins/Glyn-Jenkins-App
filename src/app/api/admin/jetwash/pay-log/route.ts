import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPayCycleSettings, listFortnightOptions } from '@/lib/fortnight'
import { fetchJetwashPayLog, fetchJetwashers } from '@/lib/jetwash/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const supabase = createServiceClient()
    const settings = await fetchPayCycleSettings(supabase)
    const periods = listFortnightOptions(12, settings)

    const periodIndex = parseInt(
      request.nextUrl.searchParams.get('periodIndex') ?? '0',
      10
    )
    const workerId = request.nextUrl.searchParams.get('workerId') || null

    const period = periods[periodIndex] ?? periods[0]
    if (!period) {
      return NextResponse.json({ error: 'Pay period not found.' }, { status: 400 })
    }

    const log = await fetchJetwashPayLog({
      periodStart: period.start,
      lockTime:    period.lockTime,
      workerId,
    })

    const jetwashers = await fetchJetwashers()

    return NextResponse.json({
      period: {
        index:    periodIndex,
        label:    period.label,
        payLabel: period.payLabel,
        start:    period.start.toISOString(),
        end:      period.end.toISOString(),
        lockTime: period.lockTime.toISOString(),
      },
      periods: periods.map((p, i) => ({
        index:    i,
        label:    p.label,
        payLabel: p.payLabel,
      })),
      jetwashers,
      ...log,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load pay log.' },
      { status: 500 }
    )
  }
}

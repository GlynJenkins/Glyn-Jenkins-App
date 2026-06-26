import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPayCycleSettings, listFortnightOptions } from '@/lib/fortnight'
import { fetchJetwashPayLog, fetchJetwashers } from '@/lib/jetwash/queries'
import JetwashPayLog from './_components/JetwashPayLog'

export const dynamic = 'force-dynamic'

export default async function AdminJetwashPayPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  const settings = await fetchPayCycleSettings(supabase)
  const periods = listFortnightOptions(12, settings)
  const period = periods[0]!

  let payLog: Awaited<ReturnType<typeof fetchJetwashPayLog>> = {
    entries: [],
    byDay:   [],
    total:   0,
  }
  let jetwashers: Awaited<ReturnType<typeof fetchJetwashers>> = []

  try {
    const [log, washers] = await Promise.all([
      fetchJetwashPayLog({ periodStart: period.start, lockTime: period.lockTime }),
      fetchJetwashers(),
    ])
    payLog = log
    jetwashers = washers
  } catch {
    // table may not exist
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Jetwash pay log</h1>
            <p className="text-slate-400 text-xs mt-1">Fortnightly washed plots by day</p>
          </div>
          <Link
            href="/admin/jetwash"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Jetwash
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <JetwashPayLog
          initial={{
            period: {
              index:    0,
              label:    period.label,
              payLabel: period.payLabel,
            },
            periods: periods.map((p, i) => ({
              index:    i,
              label:    p.label,
              payLabel: p.payLabel,
            })),
            jetwashers,
            byDay:    payLog.byDay,
            total:    payLog.total,
          }}
        />
      </div>
    </div>
  )
}

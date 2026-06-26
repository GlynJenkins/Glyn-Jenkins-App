import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { notFound }            from 'next/navigation'
import Link                    from 'next/link'
import WorkerProfile           from './_components/WorkerProfile'
import { relationOne }         from '@/lib/supabase/normalize-relations'
import { syncMissingCisLedger } from '@/lib/cis/ledger-sync'
import { fetchWorkerPayDiagnostics } from '@/lib/cis/worker-pay-diagnostics'
import type { LedgerEntry }    from './_components/WorkerProfile'

export const dynamic = 'force-dynamic'

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ workerId: string }>
}) {
  const { workerId } = await params
  await requireAdminAccess()

  const supabase = createServiceClient()

  const { data: worker } = await supabase
    .from('workers')
    .select(`
      id, first_name, surname, phone, email, utr_number,
      tax_type, role, status, has_personal_insurance, created_at,
      auth_user_id,
      subcontract_agreement_pdf_url, subcontract_signature_url
    `)
    .eq('id', workerId)
    .maybeSingle()

  if (!worker) notFound()

  await syncMissingCisLedger(supabase, { workerId })
  const payDiagnostics = await fetchWorkerPayDiagnostics(supabase, worker)

  const { data: ledgerRaw } = await supabase
    .from('worker_cis_ledger')
    .select(`
      id, date_of_pay, gross_pay, cis_tax_deducted,
      admin_fee, insurance_fee, custom_deduction, custom_deduction_note,
      net_pay, claim_period_id,
      claim_periods ( period_start, period_end, sites ( name ) )
    `)
    .eq('worker_id', workerId)
    .order('date_of_pay', { ascending: false })

  const ledger: LedgerEntry[] = (ledgerRaw ?? []).map((entry) => {
    const claimPeriod = relationOne(entry.claim_periods)
    return {
      ...entry,
      claim_periods: claimPeriod
        ? {
            period_start: claimPeriod.period_start,
            period_end:   claimPeriod.period_end,
            sites:        relationOne(claimPeriod.sites),
          }
        : null,
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">
              {worker.first_name} {worker.surname}
            </h1>
          </div>
          <Link
            href="/admin/workers"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors"
          >
            ← Workers
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        <WorkerProfile worker={worker} ledger={ledger} payDiagnostics={payDiagnostics} />
      </div>
    </div>
  )
}

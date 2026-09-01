import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import WorkerList from '../_components/WorkerList'
import LogoutButton from '../_components/LogoutButton'
import { syncMissingCisLedger } from '@/lib/cis/ledger-sync'

export const dynamic = 'force-dynamic'

export default async function AdminWorkersPage() {
  await requireAdminAccess()

  const supabase = createServiceClient()
  const syncResult = await syncMissingCisLedger(supabase)
  if (syncResult.inserted > 0) {
    console.info(`[Admin Workers] Backfilled ${syncResult.inserted} missing CIS ledger rows`)
  }

  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, first_name, surname, phone, utr_number, tax_type, role, status, has_personal_insurance, cscs_card_url, id_document_url, insurance_certificate_url, hs_qualification_url, firesock_certificate_url, date_of_birth, created_at, right_to_work_status')
    .order('created_at', { ascending: false })

  let workerRowsRaw: Array<Record<string, unknown>> | null = workers as Array<Record<string, unknown>> | null
  if (error && (/right_to_work/i.test(error.message) || error.code === 'PGRST204')) {
    console.warn('[Admin Workers] RTW column missing — run add_right_to_work.sql')
    const legacy = await supabase
      .from('workers')
      .select('id, first_name, surname, phone, utr_number, tax_type, role, status, has_personal_insurance, cscs_card_url, id_document_url, insurance_certificate_url, hs_qualification_url, firesock_certificate_url, date_of_birth, created_at')
      .order('created_at', { ascending: false })
    workerRowsRaw = legacy.data as Array<Record<string, unknown>> | null
  } else if (error) {
    console.error('[Admin Workers] Failed to fetch workers:', error.message)
  }

  const workerRows = (workerRowsRaw ?? []).map((row) => {
    const { utr_number, ...rest } = row
    const utr = typeof utr_number === 'string' ? utr_number : null
    return {
      ...rest,
      right_to_work_status: (typeof rest.right_to_work_status === 'string'
        ? rest.right_to_work_status
        : null) as string | null,
      // Mask before the client bundle — never ship full UTR to the browser list.
      utr_masked: utr && utr.length >= 4
        ? `••••${utr.slice(-4)}`
        : utr
          ? '••••'
          : null,
    }
  }) as Array<{
    id: string
    first_name: string
    surname: string
    phone: string
    tax_type: string
    role: string
    status: string
    has_personal_insurance: boolean
    cscs_card_url: string | null
    id_document_url: string | null
    insurance_certificate_url: string | null
    hs_qualification_url: string | null
    firesock_certificate_url: string | null
    date_of_birth: string | null
    created_at: string
    right_to_work_status: string | null
    utr_masked: string | null
  }>
  const pendingCount = workerRows.filter((w) => w.status === 'pending_verification').length
  const rtwPendingCount = workerRows.filter(
    (w) => w.right_to_work_status === 'pending' || w.right_to_work_status === 'follow_up',
  ).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-orange-400 text-xs font-semibold tracking-widest uppercase hover:text-orange-300"
            >
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Workers</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Inductions, profiles &amp; activation
              {pendingCount > 0 && (
                <span className="ml-2 text-amber-400">· {pendingCount} pending review</span>
              )}
              {rtwPendingCount > 0 && (
                <span className="ml-2 text-orange-300">· {rtwPendingCount} RTW to verify</span>
              )}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 pb-16">
        <WorkerList initialWorkers={workerRows} />
      </main>
    </div>
  )
}

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
    .select('id, first_name, surname, phone, utr_number, tax_type, role, status, has_personal_insurance, cscs_card_url, id_document_url, insurance_certificate_url, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Admin Workers] Failed to fetch workers:', error.message)
  }

  const workerRows = workers ?? []
  const pendingCount = workerRows.filter((w) => w.status === 'pending_verification').length

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

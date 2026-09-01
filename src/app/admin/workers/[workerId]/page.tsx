import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { notFound }            from 'next/navigation'
import Link                    from 'next/link'
import WorkerProfile           from './_components/WorkerProfile'
import { relationOne }         from '@/lib/supabase/normalize-relations'
import { syncMissingCisLedger } from '@/lib/cis/ledger-sync'
import { fetchWorkerPayDiagnostics } from '@/lib/cis/worker-pay-diagnostics'
import { maskLast4 }           from '@/lib/induction/payment-details'
import { normalizeSortCode }   from '@/lib/claims/payroll-csv'
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

  const fullSelect = await supabase
    .from('workers')
    .select(`
      id, first_name, surname, phone, email, utr_number, ni_number,
      tax_type, role, status, has_personal_insurance, created_at,
      auth_user_id, bank_sort_code, bank_account_number,
      subcontract_agreement_pdf_url, subcontract_signature_url,
      employed_contract_signed,
      bricklayer_qualification, hs_qualification_url, hs_qualification_na,
      firesock_certificate_url, date_of_birth, home_address,
      cscs_card_url, id_document_url, insurance_certificate_url,
      payment_details_updated_at, payment_details_updated_by,
      right_to_work_method, right_to_work_document_url, right_to_work_share_code,
      right_to_work_status, right_to_work_verified_at, right_to_work_verified_by,
      right_to_work_note, right_to_work_type, right_to_work_expiry,
      right_to_work_override_at, right_to_work_override_by,
      right_to_work_override_note
    `)
    .eq('id', workerId)
    .maybeSingle()

  let worker = fullSelect.data
  if (fullSelect.error && (/right_to_work/i.test(fullSelect.error.message) || fullSelect.error.code === 'PGRST204')) {
    console.warn('[WorkerProfile] RTW columns missing — run add_right_to_work.sql')
    const legacy = await supabase
      .from('workers')
      .select(`
        id, first_name, surname, phone, email, utr_number, ni_number,
        tax_type, role, status, has_personal_insurance, created_at,
        auth_user_id, bank_sort_code, bank_account_number,
        subcontract_agreement_pdf_url, subcontract_signature_url,
        employed_contract_signed,
        bricklayer_qualification, hs_qualification_url, hs_qualification_na,
        firesock_certificate_url, date_of_birth, home_address,
        cscs_card_url, id_document_url, insurance_certificate_url,
        payment_details_updated_at, payment_details_updated_by
      `)
      .eq('id', workerId)
      .maybeSingle()
    worker = legacy.data as typeof worker
  }

  if (!worker) notFound()

  await syncMissingCisLedger(supabase, { workerId })
  const payDiagnostics = await fetchWorkerPayDiagnostics(supabase, worker)

  const { data: lastReveal } = await supabase
    .from('sensitive_reveals')
    .select('revealed_at, revealed_by')
    .eq('worker_id', workerId)
    .order('revealed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then((res) => {
      if (res.error) {
        console.warn('[WorkerProfile] sensitive_reveals unavailable — run the migration:', res.error.message)
        return { data: null }
      }
      return res
    })

  const { data: ledgerRaw } = await supabase
    .from('worker_cis_ledger')
    .select(`
      id, date_of_pay, gross_pay, cis_tax_deducted,
      admin_fee, insurance_fee, custom_deduction, custom_deduction_note,
      net_pay, claim_period_id,
      sites ( name ),
      claim_periods ( period_start, period_end, sites ( name ) )
    `)
    .eq('worker_id', workerId)
    .order('date_of_pay', { ascending: false })

  const ledger: LedgerEntry[] = (ledgerRaw ?? []).map((entry) => {
    const claimPeriod = relationOne(entry.claim_periods)
    return {
      ...entry,
      sites: relationOne(entry.sites),
      claim_periods: claimPeriod
        ? {
            period_start: claimPeriod.period_start,
            period_end:   claimPeriod.period_end,
            sites:        relationOne(claimPeriod.sites),
          }
        : null,
    }
  })

  // Strip full bank/UTR/NI from the RSC payload — reveal endpoint is the only full-value path.
  const sortForMask = normalizeSortCode(worker.bank_sort_code) ?? worker.bank_sort_code
  const publicWorker = {
    id:                            worker.id,
    first_name:                    worker.first_name,
    surname:                       worker.surname,
    phone:                         worker.phone,
    email:                         worker.email,
    tax_type:                      worker.tax_type,
    role:                          worker.role,
    status:                        worker.status,
    has_personal_insurance:        worker.has_personal_insurance,
    created_at:                    worker.created_at,
    auth_user_id:                  worker.auth_user_id,
    subcontract_agreement_pdf_url: worker.subcontract_agreement_pdf_url,
    subcontract_signature_url:     worker.subcontract_signature_url,
    employed_contract_signed:      worker.employed_contract_signed,
    bricklayer_qualification:      worker.bricklayer_qualification,
    hs_qualification_url:          worker.hs_qualification_url,
    hs_qualification_na:           worker.hs_qualification_na,
    firesock_certificate_url:      worker.firesock_certificate_url,
    cscs_card_url:                 worker.cscs_card_url,
    id_document_url:               worker.id_document_url,
    insurance_certificate_url:     worker.insurance_certificate_url,
    date_of_birth:                 worker.date_of_birth,
    home_address:                  worker.home_address,
    payment_details_updated_at:    worker.payment_details_updated_at,
    payment_details_updated_by:    worker.payment_details_updated_by,
    right_to_work_method:          ('right_to_work_method' in worker ? worker.right_to_work_method : null) as string | null,
    right_to_work_document_url:    ('right_to_work_document_url' in worker ? worker.right_to_work_document_url : null) as string | null,
    right_to_work_share_code:      ('right_to_work_share_code' in worker ? worker.right_to_work_share_code : null) as string | null,
    right_to_work_status:          ('right_to_work_status' in worker ? worker.right_to_work_status : null) as string | null,
    right_to_work_verified_at:     ('right_to_work_verified_at' in worker ? worker.right_to_work_verified_at : null) as string | null,
    right_to_work_verified_by:     ('right_to_work_verified_by' in worker ? worker.right_to_work_verified_by : null) as string | null,
    right_to_work_note:            ('right_to_work_note' in worker ? worker.right_to_work_note : null) as string | null,
    right_to_work_type:            ('right_to_work_type' in worker ? worker.right_to_work_type : null) as string | null,
    right_to_work_expiry:          ('right_to_work_expiry' in worker ? worker.right_to_work_expiry : null) as string | null,
    right_to_work_override_at:     ('right_to_work_override_at' in worker ? worker.right_to_work_override_at : null) as string | null,
    right_to_work_override_by:     ('right_to_work_override_by' in worker ? worker.right_to_work_override_by : null) as string | null,
    right_to_work_override_note:   ('right_to_work_override_note' in worker ? worker.right_to_work_override_note : null) as string | null,
    bank_sort_masked:              maskLast4(sortForMask) || null,
    bank_account_masked:           maskLast4(worker.bank_account_number) || null,
    utr_masked:                    maskLast4(worker.utr_number) || null,
    ni_masked:                     maskLast4(worker.ni_number) || null,
    last_sensitive_reveal_at:      lastReveal?.revealed_at ?? null,
    last_sensitive_reveal_by:      lastReveal?.revealed_by ?? null,
  }

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
        <WorkerProfile worker={publicWorker} ledger={ledger} payDiagnostics={payDiagnostics} />
      </div>
    </div>
  )
}

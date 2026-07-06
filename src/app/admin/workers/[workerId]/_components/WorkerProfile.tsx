'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  User, Phone, FileText, Building2,
  TrendingUp, Download, ChevronDown, ChevronUp,
  Calendar, PoundSterling, Briefcase, KeyRound, Loader2, CheckCircle,
} from 'lucide-react'
import { needsPortalLogin } from '@/lib/worker-access'

// ── Types ──────────────────────────────────────────────────────────────────────

export type LedgerEntry = {
  id:                    string
  date_of_pay:           string
  gross_pay:             number
  cis_tax_deducted:      number
  admin_fee:             number
  insurance_fee:         number
  custom_deduction:      number | null
  custom_deduction_note: string | null
  net_pay:               number
  claim_period_id:       string
  sites:                 { name: string } | null
  claim_periods: {
    period_start: string
    period_end:   string
    sites:        { name: string } | null
  } | null
}

function ledgerSiteName(entry: LedgerEntry): string {
  return entry.sites?.name
    ?? entry.claim_periods?.sites?.name
    ?? 'Glyn Jenkins LTD'
}

type Worker = {
  id:                              string
  first_name:                      string
  surname:                         string
  phone:                           string
  email:                           string | null
  utr_number:                      string | null
  tax_type:                        string | null
  role:                            string
  status:                          string
  has_personal_insurance:          boolean | null
  created_at:                      string
  auth_user_id:                    string | null
  bank_sort_code:                  string | null
  bank_account_number:             string | null
  subcontract_agreement_pdf_url:   string | null
  subcontract_signature_url:       string | null
}

interface Props {
  worker: Worker
  ledger: LedgerEntry[]
  payDiagnostics?: {
    approvedGross:              number
    approvedAllocationCount:    number
    pendingGross:               number
    pendingAllocationCount:     number
    approvedClaimsAsForeman:    number
    foremanClaimsWithoutPay:    number
    duplicateNameMatches:       { id: string; first_name: string; surname: string; role: string }[]
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '£' + (n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', foreman: 'Foreman', management: 'Management',
  bricklayer: 'Bricklayer', labourer: 'Labourer', apprentice: 'Apprentice',
  jetwasher: 'Jetwasher',
}

const ASSIGNABLE_ROLES = [
  { value: 'bricklayer', label: 'Bricklayer' },
  { value: 'labourer',   label: 'Labourer' },
  { value: 'apprentice', label: 'Apprentice' },
  { value: 'foreman',    label: 'Foreman' },
  { value: 'management', label: 'Management' },
  { value: 'jetwasher',  label: 'Jetwasher' },
] as const

const STATUS_COLORS: Record<string, string> = {
  active:               'bg-green-100 text-green-700',
  inactive:             'bg-gray-100 text-gray-500',
  pending_verification: 'bg-amber-100 text-amber-700',
}

// ── Statement print helper ─────────────────────────────────────────────────────

function printStatement(worker: Worker, entries: LedgerEntry[]) {
  const totals = entries.reduce(
    (acc, e) => ({
      gross: acc.gross + (e.gross_pay ?? 0),
      cis:   acc.cis   + (e.cis_tax_deducted ?? 0),
      fees:  acc.fees  + (e.admin_fee ?? 0) + (e.insurance_fee ?? 0) + (e.custom_deduction ?? 0),
      net:   acc.net   + (e.net_pay ?? 0),
    }),
    { gross: 0, cis: 0, fees: 0, net: 0 }
  )

  const rows = entries
    .map(
      (e) => `
      <tr>
        <td>${fmtDate(e.date_of_pay)}</td>
        <td>${ledgerSiteName(e)}</td>
        <td>${fmt(e.gross_pay)}</td>
        <td>${fmt(e.cis_tax_deducted)}</td>
        <td>${fmt((e.admin_fee ?? 0) + (e.insurance_fee ?? 0) + (e.custom_deduction ?? 0))}</td>
        <td><strong>${fmt(e.net_pay)}</strong></td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>CIS Statement — ${worker.first_name} ${worker.surname}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; margin: 40px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { text-align: left; font-size: 11px; text-transform: uppercase;
           color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
      td { padding: 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
      tr:last-child td { border-bottom: none; }
      .totals td { font-weight: bold; border-top: 2px solid #334155;
                   padding-top: 10px; font-size: 13px; }
      .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; }
    </style>
    </head><body>
    <h1>CIS Payment Statement</h1>
    <div class="sub">
      ${worker.first_name} ${worker.surname} &bull;
      UTR: ${worker.utr_number ?? 'N/A'} &bull;
      ${ROLE_LABELS[worker.role] ?? worker.role} &bull;
      ${worker.tax_type === 'cis_20' ? 'CIS 20%' : 'Gross'}<br/>
      Generated: ${fmtDate(new Date().toISOString())} &bull; Glyn Jenkins LTD
    </div>
    <table>
      <thead><tr>
        <th>Date</th><th>Site</th><th>Gross</th><th>CIS Tax</th><th>Fees</th><th>Net Pay</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="totals">
        <td colspan="2">TOTALS (${entries.length} payments)</td>
        <td>${fmt(totals.gross)}</td>
        <td>${fmt(totals.cis)}</td>
        <td>${fmt(totals.fees)}</td>
        <td>${fmt(totals.net)}</td>
      </tr></tfoot>
    </table>
    <div class="footer">
      This statement is for HMRC self-assessment purposes. Keep for your records.
    </div>
    </body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `CIS-Statement-${worker.surname}-${worker.first_name}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Row component ──────────────────────────────────────────────────────────────

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {ledgerSiteName(entry)}
            </p>
            <p className="text-xs text-slate-400">{fmtDate(entry.date_of_pay)}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm font-bold text-slate-900">{fmt(entry.net_pay)}</span>
            {open
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="mx-4 mb-3 bg-gray-50 rounded-xl px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Gross pay</span><span className="font-medium">{fmt(entry.gross_pay)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Admin fee</span><span>-{fmt(entry.admin_fee ?? 0)}</span>
          </div>
          {(entry.insurance_fee ?? 0) > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>Insurance fee</span><span>-{fmt(entry.insurance_fee ?? 0)}</span>
            </div>
          )}
          {(entry.custom_deduction ?? 0) > 0 && (
            <div className="flex justify-between text-red-500">
              <span>{entry.custom_deduction_note || 'Deduction'}</span>
              <span>-{fmt(entry.custom_deduction ?? 0)}</span>
            </div>
          )}
          {(entry.cis_tax_deducted ?? 0) > 0 && (
            <div className="flex justify-between text-blue-600">
              <span>CIS 20% tax</span><span>-{fmt(entry.cis_tax_deducted ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-slate-800 border-t border-gray-200 pt-1.5">
            <span>Net pay</span><span>{fmt(entry.net_pay)}</span>
          </div>
          {entry.claim_periods && (
            <p className="text-slate-400 pt-0.5">
              Period: {fmtDate(entry.claim_periods.period_start)} –{' '}
              {fmtDate(entry.claim_periods.period_end)}
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WorkerProfile({ worker, ledger, payDiagnostics }: Props) {
  const currentYear = new Date().getFullYear()
  const [fromDate,   setFromDate]   = useState(`${currentYear}-04-06`)
  const [toDate,     setToDate]     = useState(`${currentYear + 1}-04-05`)
  const [printing,   setPrinting]   = useState(false)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)

  const [role,            setRole]            = useState(worker.role)
  const [portalPassword,  setPortalPassword]  = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [roleSaving,      setRoleSaving]      = useState(false)
  const [roleError,       setRoleError]       = useState<string | null>(null)
  const [roleSuccess,     setRoleSuccess]     = useState<string | null>(null)
  const [hasPortalLogin,  setHasPortalLogin]  = useState(!!worker.auth_user_id)

  const roleNeedsLogin     = needsPortalLogin(role)
  const hadPortalRole      = needsPortalLogin(worker.role)
  const demotingFromPortal = hadPortalRole && !roleNeedsLogin
  const showPasswordFields = roleNeedsLogin && !hasPortalLogin
  const roleChanged        = role !== worker.role

  const saveRole = async () => {
    setRoleError(null)
    setRoleSuccess(null)

    if (!roleChanged && !showPasswordFields) return

    if (showPasswordFields) {
      if (portalPassword.length < 8) {
        setRoleError('Portal password must be at least 8 characters.')
        return
      }
      if (portalPassword !== confirmPassword) {
        setRoleError('Passwords do not match.')
        return
      }
    }

    setRoleSaving(true)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          role,
          ...(showPasswordFields ? { portalPassword } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not update role.')

      if (json.hasPortalLogin) setHasPortalLogin(true)
      if (json.portalLoginRevoked) setHasPortalLogin(false)
      setPortalPassword('')
      setConfirmPassword('')

      const label = ROLE_LABELS[role] ?? role
      if (json.portalLoginCreated) {
        setRoleSuccess(`Role updated to ${label}. Portal login created — worker can sign in once active.`)
      } else if (json.portalLoginRevoked) {
        setRoleSuccess(
          `Role updated to ${label}. Portal access removed and site assignments cleared. All payment history is unchanged.`
        )
      } else if (roleChanged) {
        setRoleSuccess(`Role updated to ${label}. All payment history is unchanged.`)
      } else {
        setRoleSuccess('Portal login created.')
      }
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Could not update role.')
    } finally {
      setRoleSaving(false)
    }
  }

  const downloadAgreement = async () => {
    setDownloadingAgreement(true)
    try {
      const res  = await fetch(`/api/admin/workers/${worker.id}/subcontract-agreement`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Download failed')
      const a = document.createElement('a')
      a.href = json.url
      a.download = json.filename ?? 'subcontract-agreement.pdf'
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    } catch {
      alert('Could not download signed agreement.')
    } finally {
      setDownloadingAgreement(false)
    }
  }

  const filteredLedger = useMemo(() => {
    const from = new Date(fromDate)
    const to   = new Date(toDate)
    to.setHours(23, 59, 59)
    return ledger.filter((e) => {
      const d = new Date(e.date_of_pay)
      return d >= from && d <= to
    })
  }, [ledger, fromDate, toDate])

  const allTotals = useMemo(() =>
    ledger.reduce(
      (acc, e) => ({
        gross: acc.gross + (e.gross_pay ?? 0),
        cis:   acc.cis   + (e.cis_tax_deducted ?? 0),
        fees:  acc.fees  + (e.admin_fee ?? 0) + (e.insurance_fee ?? 0) + (e.custom_deduction ?? 0),
        net:   acc.net   + (e.net_pay ?? 0),
      }),
      { gross: 0, cis: 0, fees: 0, net: 0 }
    ),
    [ledger]
  )

  return (
    <div className="space-y-4">

      {/* Worker info card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg">
              {worker.first_name} {worker.surname}
            </p>
            <p className="text-sm text-slate-500">
              {ROLE_LABELS[role] ?? role}
              {worker.tax_type === 'cis_20' ? ' · CIS 20%' : worker.tax_type === 'gross' ? ' · Gross' : ''}
              {worker.has_personal_insurance ? ' · Own insurance' : ''}
            </p>
          </div>
          <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full capitalize
            ${STATUS_COLORS[worker.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {worker.status.replace('_', ' ')}
          </span>
        </div>

        <div className="divide-y divide-gray-50 text-sm text-slate-600 space-y-0">
          <div className="flex items-center gap-2 py-2">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{worker.phone}</span>
          </div>
          {worker.utr_number && (
            <div className="flex items-center gap-2 py-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>UTR: {worker.utr_number}</span>
            </div>
          )}
          {worker.bank_sort_code && worker.bank_account_number ? (
            <div className="flex items-center gap-2 py-2">
              <PoundSterling className="w-3.5 h-3.5 text-slate-400" />
              <span>Bank: {worker.bank_sort_code} · {worker.bank_account_number}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-amber-700 text-xs">
              <PoundSterling className="w-3.5 h-3.5 shrink-0" />
              <span>No bank on file — worker must complete registration at /induction</span>
            </div>
          )}
          <div className="flex items-center gap-2 py-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Inducted: {fmtDate(worker.created_at)}</span>
          </div>
        </div>

        {worker.subcontract_agreement_pdf_url && (
          <button
            type="button"
            onClick={downloadAgreement}
            disabled={downloadingAgreement}
            className="w-full flex items-center justify-center gap-2 px-4 py-3
                       bg-orange-50 hover:bg-orange-100 text-orange-700
                       text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloadingAgreement ? 'Opening…' : 'Download Signed Subcontract (PDF)'}
          </button>
        )}
      </div>

      {/* Job role & portal access */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-slate-500" />
          <p className="font-semibold text-slate-800 text-sm">Job Role & Portal Access</p>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Change this worker&apos;s job role on the same person record — CIS payments and wage
          totals are always kept, whether promoting or demoting. No re-registration needed.
        </p>

        {demotingFromPortal && (
          <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Demoting from Foreman or Management will remove their portal login and foreman site
              assignments. They can still appear on claims as a bricklayer/labourer/apprentice.
            </span>
          </div>
        )}

        <div>
          <label className="text-xs text-slate-500 mb-1 block">Job role</label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setRoleError(null)
              setRoleSuccess(null)
            }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                       bg-white outline-none focus:ring-2 focus:ring-orange-400"
          >
            {worker.role === 'admin' && (
              <option value="admin">Admin (system — contact developer to change)</option>
            )}
            {ASSIGNABLE_ROLES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {worker.email && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{worker.email}</span>
          </div>
        )}

        <div className={`text-xs px-3 py-2 rounded-xl ${
          hasPortalLogin && roleNeedsLogin
            ? 'bg-green-50 text-green-700 border border-green-100'
            : roleNeedsLogin
            ? 'bg-amber-50 text-amber-700 border border-amber-100'
            : 'bg-gray-50 text-slate-500 border border-gray-100'
        }`}>
          {roleNeedsLogin
            ? hasPortalLogin
              ? 'Portal login is set up. Worker can sign in to the foreman or admin portal (when active).'
              : 'Portal login not set up — set a password below when promoting to Foreman or Management.'
            : 'Site workers (bricklayer, labourer, apprentice) do not use the portal.'}
        </div>

        {showPasswordFields && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Create portal password</label>
              <input
                type="password"
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                           focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none
                           focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <p className="text-xs text-slate-400">
              Share this password with the worker. They sign in with their registration email.
              {role === 'foreman' && ' Then assign them to sites from the site admin page.'}
            </p>
          </div>
        )}

        {roleError && (
          <p className="text-xs text-red-600">{roleError}</p>
        )}
        {roleSuccess && (
          <p className="flex items-start gap-1.5 text-xs text-green-700">
            <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {roleSuccess}
          </p>
        )}

        <button
          type="button"
          onClick={saveRole}
          disabled={roleSaving || (!roleChanged && !showPasswordFields)}
          className="w-full flex items-center justify-center gap-2 py-3
                     bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed
                     text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {roleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {roleSaving ? 'Saving…' : 'Save role changes'}
        </button>
      </div>

      {/* Pay diagnostics when empty or unclear */}
      {payDiagnostics && ledger.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-950 space-y-2">
          <p className="font-semibold">No pay records for this worker profile</p>
          {payDiagnostics.approvedAllocationCount === 0 &&
           payDiagnostics.pendingAllocationCount === 0 &&
           payDiagnostics.approvedClaimsAsForeman === 0 && (
            <p className="text-amber-900">
              No booking-in claims have allocated wages to this worker yet. Pay only appears
              after a foreman adds them to the gang with a gross amount and admin approves the claim.
            </p>
          )}
          {payDiagnostics.foremanClaimsWithoutPay > 0 && (
            <p className="text-amber-900">
              This worker submitted {payDiagnostics.foremanClaimsWithoutPay} approved claim
              {payDiagnostics.foremanClaimsWithoutPay !== 1 ? 's' : ''} as foreman but was not
              given any pay on {payDiagnostics.foremanClaimsWithoutPay !== 1 ? 'those claims' : 'that claim'}.
              To pay a foreman, include them in the gang and enter a gross amount before submitting.
            </p>
          )}
          {payDiagnostics.pendingAllocationCount > 0 && (
            <p className="text-amber-900">
              {payDiagnostics.pendingAllocationCount} pending payment
              {payDiagnostics.pendingAllocationCount !== 1 ? 's' : ''} totalling{' '}
              {fmt(payDiagnostics.pendingGross)} — will show here once the claim is approved.
            </p>
          )}
          {payDiagnostics.duplicateNameMatches.length > 0 && (
            <div className="pt-1">
              <p className="text-amber-900 font-medium">Other profiles with the same name:</p>
              <ul className="mt-1 space-y-1">
                {payDiagnostics.duplicateNameMatches.map((match) => (
                  <li key={match.id}>
                    <Link
                      href={`/admin/workers/${match.id}`}
                      className="text-orange-700 underline underline-offset-2"
                    >
                      {match.first_name} {match.surname} · {ROLE_LABELS[match.role] ?? match.role}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* All-time totals */}
      <div className="bg-slate-900 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-orange-400" />
          <p className="text-white font-semibold text-sm">All-Time Totals</p>
          <span className="ml-auto text-slate-500 text-xs">{ledger.length} payments</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Gross',   value: allTotals.gross, color: 'text-white' },
            { label: 'Total Net Pay', value: allTotals.net,   color: 'text-orange-400' },
            { label: 'CIS Tax',       value: allTotals.cis,   color: 'text-blue-400'   },
            { label: 'Total Fees',    value: allTotals.fees,  color: 'text-slate-400'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-3">
              <p className="text-slate-400 text-xs mb-1">{label}</p>
              <p className={`font-bold text-base ${color}`}>{fmt(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CIS Statement export */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-slate-500" />
          <p className="font-semibold text-slate-800 text-sm">CIS Statement Export</p>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none
                         focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none
                         focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        {filteredLedger.length > 0 ? (
          <>
            {/* Mini summary for filtered range */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(() => {
                const ft = filteredLedger.reduce(
                  (acc, e) => ({
                    gross: acc.gross + (e.gross_pay ?? 0),
                    cis:   acc.cis   + (e.cis_tax_deducted ?? 0),
                    fees:  acc.fees  + (e.admin_fee ?? 0) + (e.insurance_fee ?? 0) + (e.custom_deduction ?? 0),
                    net:   acc.net   + (e.net_pay ?? 0),
                  }),
                  { gross: 0, cis: 0, fees: 0, net: 0 }
                )
                return [
                  { label: 'Gross',    value: ft.gross, color: 'text-slate-800' },
                  { label: 'Net Pay',  value: ft.net,   color: 'text-green-700' },
                  { label: 'CIS Tax',  value: ft.cis,   color: 'text-blue-600'  },
                  { label: 'Fees',     value: ft.fees,  color: 'text-slate-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                    <p className={`font-bold text-sm ${color}`}>{fmt(value)}</p>
                  </div>
                ))
              })()}
            </div>

            <button
              disabled={printing}
              onClick={() => {
                if (printing) return
                setPrinting(true)
                printStatement(worker, filteredLedger)
                setTimeout(() => setPrinting(false), 3000)
              }}
              className="w-full flex items-center justify-center gap-2 py-3
                         bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold
                         rounded-xl transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {printing ? 'Opening…' : `Print / Save Statement (${filteredLedger.length} payments)`}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">
            No payments in this date range
          </p>
        )}
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
          <PoundSterling className="w-4 h-4 text-slate-400" />
          <p className="font-semibold text-slate-800 text-sm">Payment History</p>
          <span className="ml-auto text-xs text-slate-400">{ledger.length} records</span>
        </div>

        {ledger.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No payments yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {ledger.map((entry) => (
              <LedgerRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

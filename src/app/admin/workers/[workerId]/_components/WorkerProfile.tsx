'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User, Phone, FileText, Building2, MapPin,
  TrendingUp, Download, ChevronDown, ChevronUp,
  Calendar, PoundSterling, Briefcase, KeyRound, Loader2, CheckCircle, ShieldCheck,
  Flame, Upload, AlertCircle, Eye, EyeOff, Copy, Trash2,
} from 'lucide-react'
import { needsPortalLogin, isEmployedContractRole } from '@/lib/worker-access'
import { firesockRequirement } from '@/lib/induction/firesock-requirement'
import {
  formatDateOfBirthWithAge,
  isUnder18,
} from '@/lib/induction/date-of-birth'
import { parseHomeAddress } from '@/lib/induction/home-address'
import {
  maskLast4,
  parsePaymentDetailsUpdate,
} from '@/lib/induction/payment-details'
import WorkerDocumentButtons from '@/app/admin/_components/WorkerDocumentButtons'
import RightToWorkCard from './RightToWorkCard'

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
  /** Masked last-4 only — full values come from the reveal endpoint. */
  utr_masked:                      string | null
  ni_masked:                       string | null
  tax_type:                        string | null
  role:                            string
  status:                          string
  has_personal_insurance:          boolean | null
  created_at:                      string
  auth_user_id:                    string | null
  bank_sort_masked:                string | null
  bank_account_masked:             string | null
  subcontract_agreement_pdf_url:   string | null
  subcontract_signature_url:       string | null
  employed_contract_signed:        boolean | null
  bricklayer_qualification:        string | null
  hs_qualification_url:            string | null
  hs_qualification_na:             boolean | null
  firesock_certificate_url:        string | null
  cscs_card_url:                   string | null
  id_document_url:                 string | null
  insurance_certificate_url:       string | null
  date_of_birth:                   string | null
  home_address:                    string | null
  payment_details_updated_at:      string | null
  payment_details_updated_by:      string | null
  last_sensitive_reveal_at:        string | null
  last_sensitive_reveal_by:        string | null
  right_to_work_method:            string | null
  right_to_work_document_url:      string | null
  right_to_work_share_code:        string | null
  right_to_work_status:            string | null
  right_to_work_verified_at:       string | null
  right_to_work_verified_by:       string | null
  right_to_work_note:              string | null
  right_to_work_override_at:       string | null
  right_to_work_override_by:       string | null
  right_to_work_override_note:     string | null
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
  contracts_manager: 'Contracts Manager',
  site_supervisor: 'Site Supervisor',
}

const ASSIGNABLE_ROLES = [
  { value: 'bricklayer',         label: 'Bricklayer' },
  { value: 'labourer',           label: 'Labourer' },
  { value: 'apprentice',         label: 'Apprentice' },
  { value: 'foreman',            label: 'Foreman' },
  { value: 'management',         label: 'Management' },
  { value: 'contracts_manager',  label: 'Contracts Manager' },
  { value: 'site_supervisor',    label: 'Site Supervisor' },
  { value: 'jetwasher',          label: 'Jetwasher' },
] as const

const STATUS_COLORS: Record<string, string> = {
  active:               'bg-green-100 text-green-700',
  inactive:             'bg-gray-100 text-gray-500',
  pending_verification: 'bg-amber-100 text-amber-700',
}

// ── Statement print helper ─────────────────────────────────────────────────────

/** Escape user-controlled values before interpolating into the statement HTML. */
function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Show only the last 4 characters of a sensitive value, e.g. "••••6789". */
function maskSensitive(value: string | null | undefined): string {
  const masked = maskLast4(value)
  return masked || 'N/A'
}

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
        <td>${escapeHtml(fmtDate(e.date_of_pay))}</td>
        <td>${escapeHtml(ledgerSiteName(e))}</td>
        <td>${fmt(e.gross_pay)}</td>
        <td>${fmt(e.cis_tax_deducted)}</td>
        <td>${fmt((e.admin_fee ?? 0) + (e.insurance_fee ?? 0) + (e.custom_deduction ?? 0))}</td>
        <td><strong>${fmt(e.net_pay)}</strong></td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>CIS Statement — ${escapeHtml(worker.first_name)} ${escapeHtml(worker.surname)}</title>
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
      ${escapeHtml(worker.first_name)} ${escapeHtml(worker.surname)} &bull;
      UTR: ${escapeHtml(maskSensitive(worker.utr_masked))} &bull;
      ${escapeHtml(ROLE_LABELS[worker.role] ?? worker.role)} &bull;
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

function DisplayOrMissing({
  label,
  display,
  copyValue,
  revealed,
}: {
  label: string
  display: string | null
  copyValue?: string | null
  revealed: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!copyValue) return
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      {display ? (
        <div className="flex items-center gap-2 text-right min-w-0">
          <span className={`font-medium text-slate-800 break-all ${revealed ? 'font-mono' : ''}`}>
            {display}
          </span>
          {revealed && copyValue && (
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                         font-medium text-orange-700 bg-orange-50 hover:bg-orange-100"
              title="Copy"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      ) : (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
          Not on file
        </span>
      )}
    </div>
  )
}

function PaymentDetailsCard({ worker }: { worker: Worker }) {
  const showUtr =
    worker.role !== 'apprentice' &&
    !isEmployedContractRole(worker.role)

  const [bankSortMasked, setBankSortMasked] = useState(worker.bank_sort_masked)
  const [bankAcctMasked, setBankAcctMasked] = useState(worker.bank_account_masked)
  const [utrMasked, setUtrMasked] = useState(worker.utr_masked)
  const [niMasked, setNiMasked] = useState(worker.ni_masked)
  const [updatedAt, setUpdatedAt] = useState(worker.payment_details_updated_at)
  const [updatedBy, setUpdatedBy] = useState(worker.payment_details_updated_by)
  const [lastRevealAt, setLastRevealAt] = useState(worker.last_sensitive_reveal_at)
  const [lastRevealBy, setLastRevealBy] = useState(worker.last_sensitive_reveal_by)

  const [revealed, setRevealed] = useState(false)
  const [revealBusy, setRevealBusy] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [fullBankSort, setFullBankSort] = useState<string | null>(null)
  const [fullBankAcct, setFullBankAcct] = useState<string | null>(null)
  const [fullUtr, setFullUtr] = useState<string | null>(null)
  const [fullNi, setFullNi] = useState<string | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  const [editing, setEditing] = useState(false)
  const [sortCode, setSortCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [confirmAccount, setConfirmAccount] = useState('')
  const [utrNumber, setUtrNumber] = useState('')
  const [niNumber, setNiNumber] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const clearReveal = () => {
    setRevealed(false)
    setFullBankSort(null)
    setFullBankAcct(null)
    setFullUtr(null)
    setFullNi(null)
    setRevealError(null)
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  const reveal = async () => {
    setRevealBusy(true)
    setRevealError(null)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}/reveal`, { method: 'POST' })
      const json = await res.json() as {
        error?: string
        bankSortCode?: string | null
        bankAccountNumber?: string | null
        utrNumber?: string | null
        niNumber?: string | null
        revealedAt?: string
        revealedBy?: string
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not reveal details.')

      setFullBankSort(json.bankSortCode ?? null)
      setFullBankAcct(json.bankAccountNumber ?? null)
      setFullUtr(json.utrNumber ?? null)
      setFullNi(json.niNumber ?? null)
      setRevealed(true)
      if (json.revealedAt) setLastRevealAt(json.revealedAt)
      if (json.revealedBy) setLastRevealBy(json.revealedBy)

      if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        clearReveal()
      }, 60_000)
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : 'Could not reveal details.')
    } finally {
      setRevealBusy(false)
    }
  }

  const resetForm = () => {
    setSortCode('')
    setAccountNumber('')
    setConfirmAccount('')
    setUtrNumber('')
    setNiNumber('')
    setFormError(null)
  }

  const cancelEdit = () => {
    resetForm()
    setEditing(false)
  }

  const save = async () => {
    setFormError(null)

    if (accountNumber.trim() && accountNumber.trim() !== confirmAccount.trim()) {
      setFormError('Account numbers do not match.')
      return
    }

    const parsed = parsePaymentDetailsUpdate({
      bankSortCode:      sortCode,
      bankAccountNumber: accountNumber,
      utrNumber:         showUtr ? utrNumber : '',
      niNumber,
    })
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }

    const fullName = `${worker.first_name} ${worker.surname}`.trim()
    const ending = parsed.masks.bankAccountNumber
      ? ` New account ending ${parsed.masks.bankAccountNumber.replace(/^•+/, '')}.`
      : ''
    const confirmed = window.confirm(
      `Update payment details for ${fullName}?${ending} Future payments will use these details.`,
    )
    if (!confirmed) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          paymentDetails: {
            ...(parsed.values.bank_sort_code
              ? { bankSortCode: sortCode, bankAccountNumber: accountNumber }
              : {}),
            ...(parsed.values.utr_number ? { utrNumber } : {}),
            ...(parsed.values.ni_number ? { niNumber } : {}),
          },
        }),
      })
      const json = await res.json() as {
        error?: string
        masks?: {
          bankSortCode?: string
          bankAccountNumber?: string
          utrNumber?: string
          niNumber?: string
        }
        paymentDetailsUpdatedAt?: string | null
        paymentDetailsUpdatedBy?: string | null
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not update payment details.')

      if (json.masks?.bankSortCode) setBankSortMasked(json.masks.bankSortCode)
      if (json.masks?.bankAccountNumber) setBankAcctMasked(json.masks.bankAccountNumber)
      if (json.masks?.utrNumber) setUtrMasked(json.masks.utrNumber)
      if (json.masks?.niNumber) setNiMasked(json.masks.niNumber)
      if (json.paymentDetailsUpdatedAt) setUpdatedAt(json.paymentDetailsUpdatedAt)
      if (json.paymentDetailsUpdatedBy) setUpdatedBy(json.paymentDetailsUpdatedBy)

      clearReveal()
      resetForm()
      setEditing(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update payment details.')
    } finally {
      setSaving(false)
    }
  }

  const bankMaskedDisplay =
    bankSortMasked && bankAcctMasked
      ? `${bankSortMasked} · ${bankAcctMasked}`
      : null

  const sortCopyDigits = fullBankSort ? fullBankSort.replace(/\D/g, '') : null

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PoundSterling className="w-4 h-4 text-slate-500" />
          <p className="font-semibold text-slate-800 text-sm">Payment details</p>
        </div>
        {!editing && (
          revealed ? (
            <button
              type="button"
              onClick={clearReveal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs
                         font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Hide
            </button>
          ) : (
            <button
              type="button"
              disabled={revealBusy}
              onClick={() => void reveal()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs
                         font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100
                         disabled:opacity-50"
            >
              {revealBusy
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Eye className="w-3.5 h-3.5" />}
              Reveal
            </button>
          )
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Values stay masked by default. Reveal to check enrolment or hand-key a payment —
        every reveal is logged. Use Update to correct a typo (fields stay blank; nothing is pre-filled).
      </p>

      <div className="divide-y divide-gray-50">
        {revealed ? (
          <>
            <DisplayOrMissing
              label="Sort code"
              revealed
              display={fullBankSort}
              copyValue={sortCopyDigits}
            />
            <DisplayOrMissing
              label="Account number"
              revealed
              display={fullBankAcct}
              copyValue={fullBankAcct}
            />
          </>
        ) : (
          <DisplayOrMissing
            label="Bank"
            revealed={false}
            display={bankMaskedDisplay}
          />
        )}
        {(showUtr || utrMasked || fullUtr) && (
          <DisplayOrMissing
            label="UTR"
            revealed={revealed}
            display={revealed ? (fullUtr || null) : (utrMasked || null)}
            copyValue={revealed ? fullUtr : null}
          />
        )}
        <DisplayOrMissing
          label="NI"
          revealed={revealed}
          display={revealed ? (fullNi || null) : (niMasked || null)}
          copyValue={revealed ? fullNi : null}
        />
      </div>

      {revealError && (
        <p className="text-sm text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {revealError}
        </p>
      )}

      {lastRevealAt && lastRevealBy && (
        <p className="text-xs text-slate-400">
          Last revealed {fmtDate(lastRevealAt)} by {lastRevealBy}
        </p>
      )}

      {updatedAt && updatedBy && (
        <p className="text-xs text-slate-400">
          Payment details updated {fmtDate(updatedAt)} by {updatedBy}
        </p>
      )}

      {!editing ? (
        <button
          type="button"
          onClick={() => {
            clearReveal()
            resetForm()
            setEditing(true)
          }}
          className="w-full px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700
                     text-sm font-semibold rounded-xl transition-colors"
        >
          Update payment details
        </button>
      ) : (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Sort code</label>
            <input
              value={sortCode}
              onChange={(e) => setSortCode(e.target.value)}
              placeholder="12-34-56"
              autoComplete="off"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         bg-white outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Account number</label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="8 digits"
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         bg-white outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Confirm account number</label>
            <input
              value={confirmAccount}
              onChange={(e) => setConfirmAccount(e.target.value)}
              placeholder="Re-enter account number"
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         bg-white outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {showUtr && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">UTR</label>
              <input
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                placeholder="10 digits"
                inputMode="numeric"
                autoComplete="off"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           bg-white outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">NI number</label>
            <input
              value={niNumber}
              onChange={(e) => setNiNumber(e.target.value.toUpperCase())}
              placeholder="e.g. AB123456C"
              maxLength={9}
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                         bg-white outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-600 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm
                         font-semibold bg-slate-900 hover:bg-slate-800 text-white
                         disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save payment details
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600
                         hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WorkerProfile({ worker, ledger, payDiagnostics }: Props) {
  const currentYear = new Date().getFullYear()
  const [fromDate,   setFromDate]   = useState(`${currentYear}-04-06`)
  const [toDate,     setToDate]     = useState(`${currentYear + 1}-04-05`)
  const [printing,   setPrinting]   = useState(false)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)
  const [firesockUrl, setFiresockUrl] = useState(worker.firesock_certificate_url)
  const [firesockBusy, setFiresockBusy] = useState(false)
  const [firesockError, setFiresockError] = useState<string | null>(null)
  const [dateOfBirth, setDateOfBirth] = useState(
    worker.date_of_birth ? worker.date_of_birth.slice(0, 10) : '',
  )
  const [dobDraft, setDobDraft] = useState(
    worker.date_of_birth ? worker.date_of_birth.slice(0, 10) : '',
  )
  const [dobBusy, setDobBusy] = useState(false)
  const [dobError, setDobError] = useState<string | null>(null)
  const [dobEditing, setDobEditing] = useState(!worker.date_of_birth)

  const [homeAddress, setHomeAddress] = useState(worker.home_address ?? '')
  const [addressDraft, setAddressDraft] = useState(worker.home_address ?? '')
  const [addressBusy, setAddressBusy] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressEditing, setAddressEditing] = useState(!worker.home_address)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const router = useRouter()

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

  const viewFiresockCert = async () => {
    setFiresockBusy(true)
    setFiresockError(null)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}/firesock-certificate`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not open certificate.')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setFiresockError(err instanceof Error ? err.message : 'Could not open certificate.')
    } finally {
      setFiresockBusy(false)
    }
  }

  const uploadFiresockCert = async (file: File | null) => {
    if (!file) return
    setFiresockBusy(true)
    setFiresockError(null)
    try {
      const fd = new FormData()
      fd.append('firesockCert', file)
      const res = await fetch(`/api/admin/workers/${worker.id}/firesock-certificate`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed.')
      setFiresockUrl(json.firesock_certificate_url ?? 'uploaded')
    } catch (err) {
      setFiresockError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setFiresockBusy(false)
    }
  }

  const firesockReq = firesockRequirement(worker.role)
  const dobLabel = formatDateOfBirthWithAge(dateOfBirth || null)
  const under18 = isUnder18(dateOfBirth || null)

  const saveDateOfBirth = async () => {
    setDobBusy(true)
    setDobError(null)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dateOfBirth: dobDraft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save date of birth.')
      const saved = String(json.dateOfBirth ?? dobDraft).slice(0, 10)
      setDateOfBirth(saved)
      setDobDraft(saved)
      setDobEditing(false)
    } catch (err) {
      setDobError(err instanceof Error ? err.message : 'Could not save date of birth.')
    } finally {
      setDobBusy(false)
    }
  }

  const saveHomeAddress = async () => {
    setAddressBusy(true)
    setAddressError(null)
    const parsed = parseHomeAddress(addressDraft)
    if (!parsed.ok) {
      setAddressError(parsed.error)
      setAddressBusy(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ homeAddress: parsed.value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save home address.')
      const saved = String(json.homeAddress ?? parsed.value)
      setHomeAddress(saved)
      setAddressDraft(saved)
      setAddressEditing(false)
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : 'Could not save home address.')
    } finally {
      setAddressBusy(false)
    }
  }

  const fullName = `${worker.first_name} ${worker.surname}`.trim()
  const deleteReady = deleteConfirm.trim().toLowerCase() === fullName.toLowerCase()

  const deleteWorker = async () => {
    if (!deleteReady) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not delete worker.')
      router.push('/admin/workers')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete worker.')
      setDeleteBusy(false)
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
          <div className="ml-auto flex flex-col items-end gap-1">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize
              ${STATUS_COLORS[worker.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {worker.status.replace('_', ' ')}
            </span>
            {under18 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Under 18
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-50 text-sm text-slate-600 space-y-0">
          <div className="flex items-center gap-2 py-2">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{worker.phone}</span>
          </div>
          <div className="flex items-start gap-2 py-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <span className="text-slate-400 text-xs block">Date of birth</span>
              {dobLabel && !dobEditing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{dobLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDobDraft(dateOfBirth)
                      setDobEditing(true)
                      setDobError(null)
                    }}
                    className="text-xs font-medium text-orange-700 hover:underline"
                  >
                    Correct
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {!dateOfBirth && (
                    <span className="text-amber-700 text-xs font-semibold">Not on file</span>
                  )}
                  <input
                    type="date"
                    value={dobDraft}
                    onChange={(e) => setDobDraft(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                               bg-white outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={dobBusy || !dobDraft}
                      onClick={() => void saveDateOfBirth()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                 font-medium bg-orange-50 hover:bg-orange-100 text-orange-700
                                 disabled:opacity-50"
                    >
                      {dobBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Save date of birth
                    </button>
                    {dateOfBirth && (
                      <button
                        type="button"
                        disabled={dobBusy}
                        onClick={() => {
                          setDobDraft(dateOfBirth)
                          setDobEditing(false)
                          setDobError(null)
                        }}
                        className="text-xs font-medium text-slate-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
              {dobError && <p className="text-xs text-red-600">{dobError}</p>}
            </div>
          </div>
          <div className="flex items-start gap-2 py-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <span className="text-slate-400 text-xs block">Home address</span>
              {homeAddress && !addressEditing ? (
                <div className="flex flex-wrap items-start gap-2">
                  <span className="whitespace-pre-line">{homeAddress}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddressDraft(homeAddress)
                      setAddressEditing(true)
                      setAddressError(null)
                    }}
                    className="text-xs font-medium text-orange-700 hover:underline shrink-0"
                  >
                    Correct
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {!homeAddress && (
                    <span className="text-amber-700 text-xs font-semibold">Not on file</span>
                  )}
                  <textarea
                    value={addressDraft}
                    onChange={(e) => setAddressDraft(e.target.value)}
                    rows={3}
                    placeholder="House number & street, town, postcode"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                               bg-white outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={addressBusy || !addressDraft.trim()}
                      onClick={() => void saveHomeAddress()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                 font-medium bg-orange-50 hover:bg-orange-100 text-orange-700
                                 disabled:opacity-50"
                    >
                      {addressBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Save home address
                    </button>
                    {homeAddress && (
                      <button
                        type="button"
                        disabled={addressBusy}
                        onClick={() => {
                          setAddressDraft(homeAddress)
                          setAddressEditing(false)
                          setAddressError(null)
                        }}
                        className="text-xs font-medium text-slate-500 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
              {addressError && <p className="text-xs text-red-600">{addressError}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 py-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Inducted: {fmtDate(worker.created_at)}</span>
          </div>
          {worker.bricklayer_qualification && (
            <div className="flex items-start gap-2 py-2">
              <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-slate-400 text-xs block">Qualification</span>
                {worker.bricklayer_qualification}
              </span>
            </div>
          )}
          {(worker.hs_qualification_url || worker.hs_qualification_na) && (
            <div className="flex items-start gap-2 py-2">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <span className="text-slate-400 text-xs block">SSSTS / SMSTS</span>
                {worker.hs_qualification_na
                  ? 'N/A — not provided'
                  : 'Certificate uploaded'}
              </span>
            </div>
          )}

          <div className="py-2 border-t border-gray-50 mt-1">
            <WorkerDocumentButtons
              workerId={worker.id}
              docs={{
                cscs_card_url:             worker.cscs_card_url,
                id_document_url:           worker.id_document_url,
                insurance_certificate_url: worker.insurance_certificate_url,
                hs_qualification_url:      worker.hs_qualification_url,
                firesock_certificate_url:  worker.firesock_certificate_url,
              }}
            />
          </div>

          {firesockReq !== 'hidden' && (
            <div className="flex items-start gap-2 py-2">
              <Flame className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <span className="text-slate-400 text-xs block">Firesock training</span>
                {firesockUrl ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      On file
                    </span>
                    <button
                      type="button"
                      onClick={viewFiresockCert}
                      disabled={firesockBusy}
                      className="text-sm font-medium text-orange-700 hover:text-orange-800
                                 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      View certificate
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        firesockReq === 'required'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Not on file
                    </span>
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm
                                  font-medium transition-colors cursor-pointer
                                  ${firesockBusy
                                    ? 'bg-slate-100 text-slate-400 pointer-events-none'
                                    : 'bg-orange-50 hover:bg-orange-100 text-orange-700'}`}
                    >
                      {firesockBusy
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Upload className="w-3.5 h-3.5" />}
                      Upload certificate
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        disabled={firesockBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          e.target.value = ''
                          void uploadFiresockCert(f)
                        }}
                      />
                    </label>
                  </div>
                )}
                {firesockError && (
                  <p className="text-xs text-red-600">{firesockError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {worker.employed_contract_signed ? (
          <p className="text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
            Employed contract: Signed ✓
          </p>
        ) : worker.subcontract_agreement_pdf_url ? (
          <button
            type="button"
            onClick={downloadAgreement}
            disabled={downloadingAgreement}
            className="w-full flex items-center justify-center gap-2 px-4 py-3
                       bg-orange-50 hover:bg-orange-100 text-orange-700
                       text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloadingAgreement
              ? 'Opening…'
              : worker.role === 'apprentice'
                ? 'Download Signed Apprenticeship Agreement (PDF)'
                : 'Download Signed Subcontract (PDF)'}
          </button>
        ) : null}
      </div>

      <RightToWorkCard
        workerId={worker.id}
        rtw={{
          right_to_work_method:         worker.right_to_work_method,
          right_to_work_document_url:   worker.right_to_work_document_url,
          right_to_work_share_code:     worker.right_to_work_share_code,
          right_to_work_status:         worker.right_to_work_status,
          right_to_work_verified_at:    worker.right_to_work_verified_at,
          right_to_work_verified_by:    worker.right_to_work_verified_by,
          right_to_work_note:           worker.right_to_work_note,
          right_to_work_override_at:    worker.right_to_work_override_at,
          right_to_work_override_by:    worker.right_to_work_override_by,
          right_to_work_override_note:  worker.right_to_work_override_note,
          id_document_url:             worker.id_document_url,
          date_of_birth:               worker.date_of_birth,
        }}
      />

      <PaymentDetailsCard worker={worker} />

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
          <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
            Portal logins: Foreman, Management, Contracts Manager, Site Supervisor, Jetwasher.
          </p>
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

      {/* Danger zone — permanent delete */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-500" />
          <p className="text-sm font-semibold text-red-700">Delete worker</p>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Permanently removes this enrolment, portal login and uploaded documents.
          Fortnightly claims they booked as a foreman are kept, with their name
          frozen on the lift history. Prefer <strong>Set Inactive</strong> for
          staff who leave so the full profile stays on file.
        </p>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => {
              setDeleteOpen(true)
              setDeleteConfirm('')
              setDeleteError(null)
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200
                       bg-red-50 text-red-700 hover:bg-red-100"
          >
            Delete permanently…
          </button>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-slate-500 block">
              Type <span className="font-semibold text-slate-700">{fullName}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm
                         outline-none focus:ring-2 focus:ring-red-300"
            />
            {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteBusy || !deleteReady}
                onClick={() => void deleteWorker()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                           font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete forever
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => {
                  setDeleteOpen(false)
                  setDeleteConfirm('')
                  setDeleteError(null)
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600
                           border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

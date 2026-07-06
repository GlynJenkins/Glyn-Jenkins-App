'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Loader2 } from 'lucide-react'
import {
  computeRegisterNet,
  filterWagesRegisterRows,
  formatWagesPeriodLabel,
  isApprenticeEmployed,
  wagesRegisterFilterOptions,
  WAGES_ROLE_LABELS,
  type WagesFortnightTab,
  type WagesRegisterRow,
} from '@/lib/claims/load-wages-register'

const fmt = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPeriod(start: string | null, end: string | null) {
  return formatWagesPeriodLabel(start, end)
}

const selectClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-orange-400'

const amountInputClass =
  'w-[4.5rem] px-2 py-1 border border-slate-200 rounded-lg text-xs text-right tabular-nums outline-none focus:ring-2 focus:ring-orange-400'

type Props = {
  rows:               WagesRegisterRow[]
  periodTabs:         WagesFortnightTab[]
  defaultPeriodKey:   string
  pendingCount?:      number
  niColumnAvailable?: boolean
}

function parseAmount(value: string) {
  const n = parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

function ApprenticeAmountInput({
  value,
  disabled,
  onSave,
}: {
  value:    number
  disabled: boolean
  onSave:   (amount: number) => void
}) {
  const [draft, setDraft] = useState(value.toFixed(2))

  useEffect(() => {
    setDraft(value.toFixed(2))
  }, [value])

  return (
    <input
      type="number"
      min={0}
      step={0.01}
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseAmount(draft)
        setDraft(parsed.toFixed(2))
        if (parsed !== value) onSave(parsed)
      }}
      className={`${amountInputClass} ${disabled ? 'opacity-50' : ''}`}
    />
  )
}

export default function WagesRegisterTable({
  rows,
  periodTabs,
  defaultPeriodKey,
  pendingCount = 0,
  niColumnAvailable = true,
}: Props) {
  const router = useRouter()
  const [foremanFilter, setForemanFilter] = useState('all')
  const [roleFilter, setRoleFilter]       = useState('all')
  const [periodFilter, setPeriodFilter]   = useState(defaultPeriodKey)
  const [localRows, setLocalRows]         = useState(rows)
  const [error, setError]                 = useState<string | null>(null)
  const [busyId, setBusyId]               = useState<string | null>(null)
  const [payrollExporting, setPayrollExporting] = useState(false)
  const [, startTransition]               = useTransition()

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  useEffect(() => {
    setPeriodFilter(defaultPeriodKey)
  }, [defaultPeriodKey])

  const periodRows = useMemo(
    () =>
      filterWagesRegisterRows(localRows, {
        periodKey: periodFilter !== 'all' ? periodFilter : undefined,
      }),
    [localRows, periodFilter],
  )

  const { foremen, roles } = useMemo(
    () => wagesRegisterFilterOptions(periodRows),
    [periodRows],
  )

  useEffect(() => {
    if (foremanFilter !== 'all' && !foremen.some((f) => f.id === foremanFilter)) {
      setForemanFilter('all')
    }
  }, [foremanFilter, foremen])

  const filteredRows = useMemo(
    () =>
      filterWagesRegisterRows(periodRows, {
        foremanId: foremanFilter !== 'all' ? foremanFilter : undefined,
        role:      roleFilter !== 'all' ? roleFilter : undefined,
      }),
    [periodRows, foremanFilter, roleFilter],
  )

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.grossPay,
          fees:  acc.fees  + r.fees,
          tax:   acc.tax   + r.tax,
          ni:    acc.ni    + r.nationalInsurance,
          net:   acc.net   + r.netPay,
        }),
        { gross: 0, fees: 0, tax: 0, ni: 0, net: 0 },
      ),
    [filteredRows],
  )

  const hasFilters =
    foremanFilter !== 'all' ||
    roleFilter !== 'all' ||
    periodFilter !== defaultPeriodKey
  const hasApprentices = periodRows.some((r) => isApprenticeEmployed(r.role))
  const activePeriodLabel =
    periodTabs.find((p) => p.key === periodFilter)?.label ??
    (periodFilter === 'all' ? 'All periods' : formatWagesPeriodLabel(null, null))

  const exportQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (foremanFilter !== 'all') params.set('foreman', foremanFilter)
    if (roleFilter !== 'all') params.set('role', roleFilter)
    if (periodFilter !== 'all') params.set('period', periodFilter)
    return params.toString()
  }, [foremanFilter, roleFilter, periodFilter])

  const exportUrl = `/api/admin/claims/export${exportQuery ? `?${exportQuery}` : ''}`
  const payrollExportUrl = `/api/admin/claims/payroll-export${exportQuery ? `?${exportQuery}` : ''}`

  const downloadPayrollCsv = async () => {
    setPayrollExporting(true)
    setError(null)
    try {
      const res = await fetch(payrollExportUrl)
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Payroll export failed.')
      }

      const needsBank = Number(res.headers.get('X-Payroll-Needs-Bank') ?? 0)
      const bankReady = Number(res.headers.get('X-Payroll-Bank-Ready') ?? 0)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'payroll.csv'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      if (needsBank > 0) {
        setError(
          `${bankReady} payment${bankReady === 1 ? '' : 's'} ready for bank transfer. ` +
          `${needsBank} worker${needsBank === 1 ? '' : 's'} have no bank on file — ` +
          `they must complete worker registration at /induction (or re-approve the claim after registration).`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payroll export failed.')
    } finally {
      setPayrollExporting(false)
    }
  }

  const saveApprenticeDeductions = (
    row: WagesRegisterRow,
    updates: { tax?: number; nationalInsurance?: number },
  ) => {
    const tax = updates.tax ?? row.tax
    const nationalInsurance = updates.nationalInsurance ?? row.nationalInsurance
    const netPay = computeRegisterNet(row.grossPay, row.fees, tax, nationalInsurance)

    setError(null)
    setBusyId(row.id)

    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, tax, nationalInsurance, netPay } : r,
      ),
    )

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/claims/ledger/${row.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tax, nationalInsurance }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not save amounts.')
        router.refresh()
      } catch (err) {
        setLocalRows(rows)
        setError(err instanceof Error ? err.message : 'Could not save amounts.')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Wages register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Approved pay from booking in · {activePeriodLabel}
          </p>
          {hasApprentices && niColumnAvailable && (
            <p className="text-xs text-violet-700 mt-1">
              Apprentices are employed — edit tax and NI from your payroll figures.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {localRows.length > 0 && (
            <>
              <button
                type="button"
                disabled={payrollExporting}
                onClick={downloadPayrollCsv}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
                title="Bank transfer CSV — payee, sort code, account, net amount"
              >
                {payrollExporting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Bank CSV
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = exportUrl }}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
              >
                <Download className="w-3.5 h-3.5" />
                Excel
              </button>
            </>
          )}
          <Link
            href="/admin/claims/pending"
            className="relative flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Pending
            {pendingCount > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {error && (
        <p className={`text-xs rounded-xl px-3 py-2 ${
          error.includes('still need bank details')
            ? 'text-amber-800 bg-amber-50 border border-amber-100'
            : 'text-red-600 bg-red-50 border border-red-100'
        }`}>
          {error}
        </p>
      )}

      {(localRows.length > 0 || periodTabs.length > 0) && (
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
              Pay period
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {periodTabs.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(p.key)
                    setForemanFilter('all')
                    setRoleFilter('all')
                  }}
                  className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    periodFilter === p.key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                  {p.rowCount > 0 && (
                    <span
                      className={`ml-1.5 tabular-nums ${
                        periodFilter === p.key ? 'text-orange-300' : 'text-slate-400'
                      }`}
                    >
                      ({p.rowCount})
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPeriodFilter('all')
                  setForemanFilter('all')
                  setRoleFilter('all')
                }}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  periodFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                All periods
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
                Foreman gang
              </span>
              <select
                value={foremanFilter}
                onChange={(e) => setForemanFilter(e.target.value)}
                className={selectClass}
              >
                <option value="all">All foremen</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
                Job role
              </span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={selectClass}
              >
                <option value="all">All roles</option>
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {hasFilters && (
        <p className="text-xs text-slate-500">
          Showing {filteredRows.length} of {periodRows.length} payment{periodRows.length !== 1 ? 's' : ''} this period
          {' · '}
          <button
            type="button"
            onClick={() => {
              setForemanFilter('all')
              setRoleFilter('all')
              setPeriodFilter(defaultPeriodKey)
            }}
            className="text-orange-600 underline"
          >
            Clear filters
          </button>
        </p>
      )}

      {(localRows.length > 0 || periodTabs.length > 0) && filteredRows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Payments
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{filteredRows.length}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <p className="text-xs text-orange-700 uppercase tracking-wide font-medium">
              Total net paid
            </p>
            <p className="text-2xl font-bold text-orange-900 mt-1">
              {'£' + totals.net.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 font-semibold text-slate-700 min-w-[140px]">
                  Name
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs">
                  Role
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs">
                  Foreman
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-left whitespace-nowrap text-xs hidden md:table-cell">
                  Period
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Gross
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Fees
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  Tax / CIS
                </th>
                <th className="px-3 py-3 font-medium text-slate-500 text-right whitespace-nowrap text-xs">
                  NI
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {localRows.length === 0
                      ? 'No approved wages yet. Approve a booking-in claim to add entries here.'
                      : periodRows.length === 0
                        ? 'No payments for this fortnight.'
                        : 'No payments match these filters.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const employed = isApprenticeEmployed(row.role) && niColumnAvailable
                  const saving = busyId === row.id

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        <Link
                          href={`/admin/workers/${row.workerId}`}
                          className="hover:text-orange-600 transition-colors"
                        >
                          {row.surname}, {row.firstName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {WAGES_ROLE_LABELS[row.role] ?? row.role}
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {row.foremanName}
                      </td>
                      <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap hidden md:table-cell">
                        {formatPeriod(row.periodStart, row.periodEnd)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-800 text-xs">
                        {fmt(row.grossPay)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 text-xs">
                        {row.fees > 0 ? `-${fmt(row.fees)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        {employed ? (
                          <div className="flex items-center justify-end gap-1">
                            {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                            <ApprenticeAmountInput
                              value={row.tax}
                              disabled={saving}
                              onSave={(tax) => saveApprenticeDeductions(row, { tax })}
                            />
                          </div>
                        ) : (
                          <span className="tabular-nums text-blue-600">
                            {row.tax > 0 ? `-${fmt(row.tax)}` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        {employed ? (
                          <div className="flex items-center justify-end gap-1">
                            <ApprenticeAmountInput
                              value={row.nationalInsurance}
                              disabled={saving}
                              onSave={(nationalInsurance) =>
                                saveApprenticeDeductions(row, { nationalInsurance })
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                        {fmt(row.netPay)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td className="sticky left-0 z-10 bg-slate-900 px-4 py-3 font-semibold" colSpan={4}>
                    Total{hasFilters ? ' (filtered)' : ''}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium">
                    {fmt(totals.gross)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium text-slate-300">
                    {totals.fees > 0 ? `-${fmt(totals.fees)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium text-blue-300">
                    {totals.tax > 0 ? `-${fmt(totals.tax)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium text-violet-300">
                    {totals.ni > 0 ? `-${fmt(totals.ni)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-300">
                    {fmt(totals.net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

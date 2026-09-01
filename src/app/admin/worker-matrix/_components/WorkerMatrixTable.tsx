'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileSpreadsheet, Phone, Search } from 'lucide-react'
import type { WorkerMatrixRow } from '@/lib/workers/load-worker-matrix'
import { WAGES_ROLE_LABELS } from '@/lib/claims/load-wages-register'
import { rtwStatusLabel } from '@/lib/induction/right-to-work'

type Tab = 'active' | 'inactive'
type SortKey = 'surname' | 'role' | 'age'

type Props = {
  active: WorkerMatrixRow[]
  inactive: WorkerMatrixRow[]
  pendingCount: number
  showExport?: boolean
}

function NotOnFile() {
  return <span className="text-amber-700 text-xs font-semibold">Not on file</span>
}

function RtwCell({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>
  const cls =
    status === 'verified'
      ? 'bg-green-100 text-green-800'
      : status === 'follow_up'
        ? 'bg-orange-100 text-orange-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rtwStatusLabel(status)}
    </span>
  )
}

function AgeCell({ row }: { row: WorkerMatrixRow }) {
  if (row.age == null) return <NotOnFile />
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{row.age}</span>
      {row.under18 && (
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
          Under 18
        </span>
      )}
    </span>
  )
}

function AddressCell({ address }: { address: string | null }) {
  if (!address) return <NotOnFile />
  return <span className="whitespace-pre-line">{address}</span>
}

export default function WorkerMatrixTable({
  active,
  inactive,
  pendingCount,
  showExport = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('surname')
  const [sortAsc, setSortAsc] = useState(true)

  const base = tab === 'active' ? active : inactive

  const rolesInList = useMemo(() => {
    const set = new Set(base.map((r) => r.role))
    return Array.from(set)
      .map((role) => ({ role, label: WAGES_ROLE_LABELS[role] ?? role }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [base])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = base.filter((r) => {
      if (roleFilter && r.role !== roleFilter) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.surname.toLowerCase().includes(q) ||
        r.firstName.toLowerCase().includes(q)
      )
    })

    rows = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'surname') {
        cmp = a.surname.localeCompare(b.surname, 'en', { sensitivity: 'base' })
        if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' })
      } else if (sortKey === 'role') {
        cmp = a.roleLabel.localeCompare(b.roleLabel, 'en', { sensitivity: 'base' })
        if (cmp === 0) cmp = a.surname.localeCompare(b.surname, 'en', { sensitivity: 'base' })
      } else {
        const aa = a.age
        const bb = b.age
        if (aa == null && bb == null) cmp = 0
        else if (aa == null) cmp = 1
        else if (bb == null) cmp = -1
        else cmp = aa - bb
        if (cmp === 0) cmp = a.surname.localeCompare(b.surname, 'en', { sensitivity: 'base' })
      }
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [base, query, roleFilter, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortAsc ? ' ↑' : ' ↓'
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: active.length },
    { key: 'inactive', label: 'Inactive', count: inactive.length },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 w-full sm:w-auto">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key)
                setRoleFilter(null)
              }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {showExport && (
          <a
            href="/api/admin/worker-matrix/export"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white
                       border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </a>
        )}
      </div>

      {pendingCount > 0 && (
        <p className="text-sm text-slate-500">
          Pending workers are not listed here —{' '}
          <Link href="/admin/workers" className="font-medium text-orange-700 hover:underline">
            open the pending queue ({pendingCount})
          </Link>
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm
                     outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {rolesInList.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              roleFilter == null
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            All roles
          </button>
          {rolesInList.map(({ role, label }) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                roleFilter === role
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">
                <button type="button" onClick={() => toggleSort('surname')} className="hover:text-slate-700">
                  Name{sortIndicator('surname')}
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">
                <button type="button" onClick={() => toggleSort('role')} className="hover:text-slate-700">
                  Job role{sortIndicator('role')}
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">
                <button type="button" onClick={() => toggleSort('age')} className="hover:text-slate-700">
                  Age{sortIndicator('age')}
                </button>
              </th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Right to work</th>
              <th className="px-4 py-3 font-semibold">Home address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No {tab} workers match
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/workers/${row.id}`}
                      className="font-medium text-slate-900 hover:text-orange-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.roleLabel}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <AgeCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${row.phone}`} className="text-slate-700 hover:text-orange-700">
                      {row.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <RtwCell status={row.rightToWorkStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <AddressCell address={row.homeAddress} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No {tab} workers match</div>
        ) : (
          filtered.map((row) => (
            <div
              key={row.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2"
            >
              <div>
                <Link
                  href={`/admin/workers/${row.id}`}
                  className="font-semibold text-slate-900 hover:text-orange-700"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-slate-500 mt-0.5">{row.roleLabel}</p>
              </div>
              <div className="text-sm text-slate-600 space-y-1.5">
                <p>
                  <span className="text-slate-400 text-xs">Age · </span>
                  <AgeCell row={row} />
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${row.phone}`} className="hover:text-orange-700">
                    {row.phone}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">RTW</span>
                  <RtwCell status={row.rightToWorkStatus} />
                </p>
                <p>
                  <span className="text-slate-400 text-xs block mb-0.5">Home address</span>
                  <AddressCell address={row.homeAddress} />
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

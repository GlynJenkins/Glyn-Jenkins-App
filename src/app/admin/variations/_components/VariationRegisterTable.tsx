'use client'

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { VariationRegisterRow } from '@/lib/variations/load-variation-register-rows'
import { formatSiteCode } from '@/lib/variations/vo-reference'

function fmt(n: number) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2 })
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function sumRows(rows: VariationRegisterRow[]) {
  return rows.reduce((acc, r) => acc + r.foremanTotal, 0)
}

const selectClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-orange-400'

export default function VariationRegisterTable({ rows }: { rows: VariationRegisterRow[] }) {
  const [siteFilter, setSiteFilter] = useState('all')
  const [referenceFilter, setReferenceFilter] = useState('all')

  const siteOptions = useMemo(() => {
    const map = new Map<string, { siteId: string; siteName: string; siteCode: string | null }>()
    for (const r of rows) {
      if (!map.has(r.siteId)) {
        map.set(r.siteId, { siteId: r.siteId, siteName: r.siteName, siteCode: r.siteCode })
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const codeA = a.siteCode ?? ''
      const codeB = b.siteCode ?? ''
      if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true })
      return a.siteName.localeCompare(b.siteName)
    })
  }, [rows])

  const referenceOptions = useMemo(() => {
    const pool = siteFilter === 'all'
      ? rows
      : rows.filter((r) => r.siteId === siteFilter)
    return pool.map((r) => ({ id: r.id, reference: r.reference }))
  }, [rows, siteFilter])

  const filteredRows = useMemo(() => {
    let result = rows
    if (siteFilter !== 'all') {
      result = result.filter((r) => r.siteId === siteFilter)
    }
    if (referenceFilter !== 'all') {
      result = result.filter((r) => r.id === referenceFilter)
    }
    return result
  }, [rows, siteFilter, referenceFilter])

  const total = sumRows(filteredRows)

  const handleSiteChange = (value: string) => {
    setSiteFilter(value)
    setReferenceFilter('all')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            VO register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Approved variations. Filter by site or reference.
          </p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => { window.location.href = '/api/admin/variations/export' }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
          No approved variations yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
                Site
              </span>
              <select
                value={siteFilter}
                onChange={(e) => handleSiteChange(e.target.value)}
                className={selectClass}
              >
                <option value="all">All sites</option>
                {siteOptions.map((s) => (
                  <option key={s.siteId} value={s.siteId}>
                    {formatSiteCode(s.siteCode)} — {s.siteName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
                Reference
              </span>
              <select
                value={referenceFilter}
                onChange={(e) => setReferenceFilter(e.target.value)}
                className={selectClass}
              >
                <option value="all">
                  {siteFilter === 'all' ? 'All references' : 'All on this site'}
                </option>
                {referenceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total foreman cost</p>
            <p className="text-base font-bold text-orange-600">{fmt(total)}</p>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
              No variations match the selected filters.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-100 text-left">
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        Reference
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Site
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 min-w-[140px]">
                        Reason for VO
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right whitespace-nowrap">
                        Foreman cost
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        Foreman
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        Approved
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        In claim
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80"
                      >
                        <td className="px-3 py-3 font-semibold text-orange-600 whitespace-nowrap">
                          {r.reference}
                        </td>
                        <td className="px-3 py-3 text-slate-700 max-w-[120px]">
                          <span className="line-clamp-2">{r.siteName}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[160px]">
                          <span className="line-clamp-2">{r.description}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700 whitespace-nowrap tabular-nums">
                          {fmt(r.foremanTotal)}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {r.foremanName}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(r.approvedAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            r.claimed ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.claimed ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-gray-200 font-semibold">
                      <td className="px-3 py-3 text-slate-700" colSpan={3}>
                        Totals ({filteredRows.length} VO{filteredRows.length === 1 ? '' : 's'})
                      </td>
                      <td className="px-3 py-3 text-right text-orange-600 tabular-nums">{fmt(total)}</td>
                      <td className="px-3 py-3" colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

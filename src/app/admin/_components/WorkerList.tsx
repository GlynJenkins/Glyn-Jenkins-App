'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Phone, FileText, CheckCircle, XCircle,
  Clock, ToggleLeft, ToggleRight, Loader2, ChevronRight,
} from 'lucide-react'

type Worker = {
  id: string
  first_name: string
  surname: string
  phone: string
  utr_number: string | null
  tax_type: string
  role: string
  status: string
  has_personal_insurance: boolean
  cscs_card_url: string | null
  id_document_url: string | null
  insurance_certificate_url: string | null
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', foreman: 'Foreman', management: 'Management',
  bricklayer: 'Bricklayer', labourer: 'Labourer', apprentice: 'Apprentice',
}

const TAX_LABELS: Record<string, string> = {
  cis_20: 'CIS 20%', gross: 'Gross',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_verification: { label: 'Pending',  cls: 'bg-amber-100 text-amber-700' },
    active:               { label: 'Active',   cls: 'bg-green-100 text-green-700' },
    inactive:             { label: 'Inactive', cls: 'bg-gray-100 text-gray-600'  },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function WorkerCard({ worker, onStatusChange }: {
  worker: Worker
  onStatusChange: (id: string, status: string) => void
}) {
  const [busy, startTransition] = useTransition()

  const toggle = (newStatus: string) => {
    startTransition(() => onStatusChange(worker.id, newStatus))
  }

  const fullName   = `${worker.first_name} ${worker.surname}`
  const submitted  = new Date(worker.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{fullName}</p>
            <p className="text-xs text-slate-500">
              {ROLE_LABELS[worker.role] ?? worker.role} &bull; {TAX_LABELS[worker.tax_type] ?? worker.tax_type}
            </p>
          </div>
        </div>
        <StatusBadge status={worker.status} />
      </div>

      {/* Details */}
      <div className="space-y-1 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>{worker.phone}</span>
        </div>
        {worker.utr_number && (
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>UTR: {worker.utr_number}</span>
          </div>
        )}
        <p className="text-xs text-slate-400">Submitted: {submitted}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/admin/workers/${worker.id}`}
          className="flex items-center gap-1 px-3 py-2 bg-orange-50 hover:bg-orange-100
                     text-orange-700 text-sm font-medium rounded-xl transition-colors"
        >
          View Profile <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        {/* Pending workers — approve or reject */}
        {worker.status === 'pending_verification' && (
          <>
            <button
              disabled={busy}
              onClick={() => toggle('active')}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700
                         text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Activate
            </button>
            <button
              disabled={busy}
              onClick={() => toggle('inactive')}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100
                         text-red-600 text-sm font-medium rounded-xl border border-red-200 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </>
        )}

        {/* Active workers — toggle to inactive */}
        {worker.status === 'active' && (
          <button
            disabled={busy}
            onClick={() => toggle('inactive')}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200
                       text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-4 h-4 text-green-500" />}
            Set Inactive
          </button>
        )}

        {/* Inactive workers — reactivate */}
        {worker.status === 'inactive' && (
          <button
            disabled={busy}
            onClick={() => toggle('active')}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200
                       text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
            Reactivate
          </button>
        )}
      </div>
    </div>
  )
}

type Tab = 'pending' | 'active' | 'inactive'

export default function WorkerList({ initialWorkers }: { initialWorkers: Worker[] }) {
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers)
  const [tab,     setTab]     = useState<Tab>('pending')
  const [error,   setError]   = useState<string | null>(null)
  const router = useRouter()

  const pending  = workers.filter((w) => w.status === 'pending_verification')
  const active   = workers.filter((w) => w.status === 'active')
  const inactive = workers.filter((w) => w.status === 'inactive')

  const listed = tab === 'pending' ? pending : tab === 'active' ? active : inactive

  const handleStatusChange = async (id: string, status: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/workers/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update status')

      setWorkers((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status } : w))
      )
      router.refresh()
    } catch {
      setError('Could not update worker status. Please try again.')
    }
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'pending',  label: 'Pending',  count: pending.length,  color: 'text-amber-600' },
    { key: 'active',   label: 'Active',   count: active.length,   color: 'text-green-600' },
    { key: 'inactive', label: 'Inactive', count: inactive.length, color: 'text-slate-500'  },
  ]

  return (
    <div className="px-4 pb-16 space-y-4 max-w-lg mx-auto">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        {tabs.map(({ key, label, count, color }) => (
          <div key={key} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Worker cards */}
      {listed.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {tab} workers</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listed.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

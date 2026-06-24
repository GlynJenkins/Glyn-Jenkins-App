'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Loader2 } from 'lucide-react'

interface Foreman {
  id:         string
  first_name: string
  surname:    string
}

interface Props {
  siteId:           string
  assignedForemen:  Foreman[]
  availableForemen: Foreman[]  // active foremen NOT yet assigned to this site
}

export default function ForemanAssignments({ siteId, assignedForemen, availableForemen }: Props) {
  const router              = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding,    setAdding]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const assign = async (foremanId: string) => {
    setLoadingId(foremanId)
    setError(null)
    const res  = await fetch(`/api/admin/sites/${siteId}/foremen`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ foremanId }),
    })
    const json = await res.json()
    setLoadingId(null)
    if (!res.ok) { setError(json.error ?? 'Failed to assign.'); return }
    setAdding(false)
    startTransition(() => router.refresh())
  }

  const remove = async (foremanId: string) => {
    setLoadingId(foremanId)
    setError(null)
    const res  = await fetch(`/api/admin/sites/${siteId}/foremen`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ foremanId }),
    })
    const json = await res.json()
    setLoadingId(null)
    if (!res.ok) { setError(json.error ?? 'Failed to remove.'); return }
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800 text-base">Assigned Foremen</h2>
          <p className="text-xs text-slate-400 mt-0.5">Foremen who can access and claim on this site</p>
        </div>
        {availableForemen.length > 0 && (
          <button
            onClick={() => setAdding((p) => !p)}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>

      {/* Add dropdown */}
      {adding && availableForemen.length > 0 && (
        <div className="px-5 pb-4 border-t border-gray-50">
          <p className="text-xs font-medium text-slate-500 mb-2 mt-3">Select a foreman to assign:</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {availableForemen.map((f) => (
              <button
                key={f.id}
                onClick={() => assign(f.id)}
                disabled={loadingId === f.id || isPending}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-200
                           hover:border-orange-400 hover:bg-orange-50 transition-colors text-left"
              >
                <span className="text-sm font-medium text-slate-800">
                  {f.first_name} {f.surname}
                </span>
                {loadingId === f.id
                  ? <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                  : <UserPlus className="w-4 h-4 text-orange-400" />
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assigned list */}
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        {assignedForemen.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400 text-center">
            No foremen assigned yet
          </p>
        ) : (
          assignedForemen.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{f.first_name} {f.surname}</p>
                <p className="text-xs text-slate-400">Foreman</p>
              </div>
              <button
                onClick={() => remove(f.id)}
                disabled={loadingId === f.id || isPending}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                title="Remove from site"
              >
                {loadingId === f.id
                  ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                  : <X className="w-4 h-4 text-red-400" />
                }
              </button>
            </div>
          ))
        )}
      </div>

      {error && <p className="px-5 py-2 text-xs text-red-500 border-t border-red-100">{error}</p>}
    </div>
  )
}

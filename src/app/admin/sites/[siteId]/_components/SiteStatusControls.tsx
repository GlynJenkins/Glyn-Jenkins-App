'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

type Props = {
  siteId: string
  siteName: string
  isActive: boolean
}

export default function SiteStatusControls({ siteId, siteName, isActive: initialActive }: Props) {
  const router = useRouter()
  const [isActive, setIsActive] = useState(initialActive)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteReady = deleteConfirm.trim().toLowerCase() === siteName.trim().toLowerCase()

  const setActive = async (next: boolean) => {
    setStatusBusy(true)
    setStatusError(null)
    try {
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isActive: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not update site status.')
      setIsActive(next)
      router.refresh()
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Could not update site status.')
    } finally {
      setStatusBusy(false)
    }
  }

  const deleteSite = async () => {
    if (!deleteReady) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/sites/${siteId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not delete site.')
      router.push('/admin/sites')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete site.')
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Site status</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Inactive sites stay in Manage Sites but drop out of foreman booking and active lists.
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {statusError && <p className="text-xs text-red-600">{statusError}</p>}

        {isActive ? (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void setActive(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                       bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
          >
            {statusBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-4 h-4 text-green-500" />}
            Set inactive
          </button>
        ) : (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void setActive(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                       bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
          >
            {statusBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
            Reactivate
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-500" />
          <p className="text-sm font-semibold text-red-700">Delete site</p>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Permanently removes this site, its price grid, foreman assignments, jetwash/firesock/QA
          data, toolbox talks and site audits for this site. Prefer <strong>Set inactive</strong> if
          the site has real pay history you may still need.
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
              Type <span className="font-semibold text-slate-700">{siteName}</span> to confirm
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
                onClick={() => void deleteSite()}
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

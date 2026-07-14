'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Columns3, Loader2, X } from 'lucide-react'

export default function AddStageColumnButton({ siteId }: { siteId: string }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleAdd = async () => {
    const stageName = name.trim()
    if (!stageName) {
      setError('Enter a column name.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res  = await fetch(`/api/sites/${siteId}/stages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stage_name: stageName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add column.')

      setOpen(false)
      setName('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add column.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null) }}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600
                   text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <Columns3 className="w-4 h-4" /> Add Column
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !saving && setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-6 pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add Stage Column</h2>
              <button
                onClick={() => !saving && setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Adds a new column to this site for every plot (houses, garages, and screen walls).
              Existing claim progress on other columns is <strong>not</strong> affected.
            </p>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Column name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Uplift"
              disabled={saving}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none
                         focus:ring-2 focus:ring-orange-400 focus:border-transparent mb-2"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <p className="text-xs text-slate-400 mb-4">
              Use for mid-site price increases. Fill values by tapping cells in the grid after adding.
            </p>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="py-3 rounded-xl border-2 border-gray-200 text-slate-700 font-semibold text-sm
                           hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300
                           text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</>
                  : <><Columns3 className="w-4 h-4" /> Add Column</>
                }
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

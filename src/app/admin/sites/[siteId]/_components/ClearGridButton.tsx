'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle, X } from 'lucide-react'

export default function ClearGridButton({ siteId }: { siteId: string }) {
  const router              = useRouter()
  const [open,    setOpen]  = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error,   setError] = useState<string | null>(null)

  const handleClear = async () => {
    setClearing(true)
    setError(null)
    const res  = await fetch(`/api/sites/${siteId}/clear`, { method: 'DELETE' })
    const json = await res.json()
    setClearing(false)
    if (!res.ok) { setError(json.error ?? 'Failed to clear.'); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700
                   text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <Trash2 className="w-4 h-4" /> Clear Grid
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-6 pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Clear Price Grid</h2>
              <button onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-200 rounded-2xl mb-5">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">This will permanently delete:</p>
                <ul className="text-xs text-red-700 mt-1 space-y-0.5 list-disc list-inside">
                  <li>All stages (columns) for this site</li>
                  <li>All price grid cells and contract values</li>
                  <li>All claim status and colour data on cells</li>
                </ul>
                <p className="text-xs text-red-600 mt-2 font-medium">
                  Approved claims and CIS ledger records are NOT affected.
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-5">
              After clearing you can upload a fresh spreadsheet using the Import Excel button.
            </p>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOpen(false)}
                className="py-3 rounded-xl border-2 border-gray-200 text-slate-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300
                           text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {clearing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Clearing…</>
                  : <><Trash2 className="w-4 h-4" /> Yes, Clear It</>
                }
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

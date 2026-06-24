'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2 } from 'lucide-react'

export default function NewSiteButton() {
  const router          = useRouter()
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [address, setAddress] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) { setError('Site name is required.'); return }
    setSaving(true)
    setError(null)
    const res  = await fetch('/api/admin/sites', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), address: address.trim() || null }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create site.'); return }
    setOpen(false)
    setName('')
    setAddress('')
    router.push(`/admin/sites/${json.siteId}`)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700
                   text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <Plus className="w-4 h-4" /> New Site
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-6 pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add New Site</h2>
              <button onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Site Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bellway Homes — Trowbridge"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Station Road, Trowbridge, BA14 1AA"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Once created you can upload your Excel price grid and assign foremen from the site page.
              </p>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300
                           text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Site'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'

const DOC_BUTTONS = [
  { type: 'cscs',      label: 'CSCS',      field: 'cscs_card_url' as const },
  { type: 'id',        label: 'Passport / ID', field: 'id_document_url' as const },
  { type: 'insurance', label: 'Insurance', field: 'insurance_certificate_url' as const },
  { type: 'hs',        label: 'SSSTS/SMSTS', field: 'hs_qualification_url' as const },
  { type: 'firesock',  label: 'Firesock',  field: 'firesock_certificate_url' as const },
] as const

type DocFields = {
  cscs_card_url: string | null
  id_document_url: string | null
  insurance_certificate_url: string | null
  hs_qualification_url?: string | null
  firesock_certificate_url: string | null
}

export default function WorkerDocumentButtons({
  workerId,
  docs,
  compact = false,
}: {
  workerId: string
  docs: DocFields
  compact?: boolean
}) {
  const [busyType, setBusyType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const available = DOC_BUTTONS.filter((d) => !!docs[d.field])

  if (!available.length) {
    return (
      <p className="text-xs text-amber-700">
        No induction documents on file.
      </p>
    )
  }

  const openDoc = async (type: string, label: string) => {
    setBusyType(type)
    setError(null)
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/documents?type=${type}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? `Could not open ${label}.`)
      const a = document.createElement('a')
      a.href = json.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not open ${label}.`)
    } finally {
      setBusyType(null)
    }
  }

  return (
    <div className="space-y-1.5">
      {!compact && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Documents
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {available.map((d) => (
          <button
            key={d.type}
            type="button"
            disabled={busyType === d.type}
            onClick={() => void openDoc(d.type, d.label)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                       bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
          >
            {busyType === d.type
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Eye className="w-3 h-3" />}
            {d.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

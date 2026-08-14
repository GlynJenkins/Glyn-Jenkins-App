'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

export default function DownloadToolboxTalkPdfButton({ talkId }: { talkId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/toolbox-talks/${talkId}/pdf`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'PDF not ready.')
      const a = document.createElement('a')
      a.href = json.url
      a.download = json.filename ?? 'toolbox-talk.pdf'
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 px-4 py-3
                   bg-orange-50 hover:bg-orange-100 text-orange-700
                   text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {busy ? 'Opening…' : 'Download PDF'}
      </button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}

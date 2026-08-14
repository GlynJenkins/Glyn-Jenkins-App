'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'

export default function DeleteDraftTalkButton({
  talkId,
  siteId,
}: {
  talkId: string
  siteId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const onDelete = async () => {
    const ok = window.confirm(
      'Delete this draft talk? Any signatures captured will be discarded.',
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/toolbox-talks/${talkId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        window.alert(json?.error ?? 'Could not delete draft.')
        setBusy(false)
        return
      }
      router.push(`/admin/toolbox-talks?siteId=${siteId}`)
      router.refresh()
    } catch {
      window.alert('Could not delete draft.')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      title="Delete draft"
      className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
      aria-label="Delete draft"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}

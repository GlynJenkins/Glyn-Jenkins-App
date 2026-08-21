'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'

async function clearSensitiveCaches() {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => /workbox|next|admin|glyn|start-url|pages/i.test(key))
        .map((key) => caches.delete(key)),
    )
  } catch {
    // Best-effort — logout must still complete.
  }
}

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    await clearSensitiveCaches()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600
                 text-white text-sm font-medium rounded-xl transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Logout
    </button>
  )
}

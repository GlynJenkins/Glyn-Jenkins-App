'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle } from 'lucide-react'

/**
 * Supabase password-reset links land here with ?code=, ?token_hash=, or #access_token=
 * in the URL. A client page is required because hash fragments never reach the server.
 */
export default function AuthConfirmPage() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const client = createClient()

    async function confirm() {
      const search = new URLSearchParams(window.location.search)
      const code      = search.get('code')
      const tokenHash  = search.get('token_hash')
      const type       = search.get('type')

      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[auth/confirm] code exchange failed:', error.message)
          setFailed(true)
          return
        }
      } else if (tokenHash && type === 'recovery') {
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (error) {
          console.error('[auth/confirm] verifyOtp failed:', error.message)
          setFailed(true)
          return
        }
      } else if (window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.slice(1))
        const accessToken  = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error } = await client.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken,
          })
          if (error) {
            console.error('[auth/confirm] setSession failed:', error.message)
            setFailed(true)
            return
          }
        }
      }

      const { data: { session } } = await client.auth.getSession()
      if (session) {
        window.location.replace('/reset-password')
        return
      }

      setFailed(true)
    }

    confirm()
  }, [])

  if (failed) {
    return (
      <div className="min-h-screen bg-slate-950 safe-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold text-slate-900">Link expired or invalid</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Request a new reset link. Make sure{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">/auth/confirm</code>{' '}
            is in your Supabase redirect URLs.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block text-orange-600 hover:text-orange-700 text-sm font-semibold"
          >
            Request new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 safe-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      <p className="text-slate-400 text-sm">Confirming reset link…</p>
    </div>
  )
}

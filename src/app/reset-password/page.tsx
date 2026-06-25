'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass,        setShowPass]        = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession,      setHasSession]      = useState(false)

  useEffect(() => {
    const client = createClient()

    async function checkSession() {
      const { data: { session } } = await client.auth.getSession()
      return !!session
    }

    checkSession().then((ok) => {
      setHasSession(ok)
      setCheckingSession(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message || 'Could not update password. Request a new reset link and try again.')
        setLoading(false)
        return
      }

      // Sign out so they land on login fresh with the new password (not auto-routed to dashboard)
      await supabase.auth.signOut()
      window.location.replace('/login?passwordReset=1')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-950 safe-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 safe-screen flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-1">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-2xl font-bold text-white">Choose new password</h1>
            <p className="text-slate-400 text-sm mt-1.5">
              Enter a new password for your portal account
            </p>
          </div>

          {!hasSession ? (
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20 space-y-4 text-center">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-sm text-slate-600 leading-relaxed">
                Your session expired. Click the link in your email again, or request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block text-orange-600 hover:text-orange-700 text-sm font-semibold"
              >
                Request new reset link
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20 space-y-5"
            >
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm outline-none
                               focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none
                             focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 leading-snug">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300
                           text-white font-semibold py-3.5 rounded-xl transition-colors
                           flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  'Save new password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

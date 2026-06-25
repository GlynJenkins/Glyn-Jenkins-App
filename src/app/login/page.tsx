'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, Mail, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('passwordReset') === '1') {
      setSuccess('Password updated successfully. Sign in with your new password.')
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        setError('Incorrect email or password. Please try again.')
        setLoading(false)
        return
      }

      // Full page navigation ensures the session cookie is sent to the server
      // before middleware checks auth (router.push alone can race and bounce back to login)
      window.location.assign('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('Supabase')) {
        setError('Portal login is misconfigured on the server. Contact your administrator.')
      } else {
        setError('Could not reach the server. Check your connection and try again.')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 safe-screen flex flex-col">
      {/* Subtle gradient backdrop */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">

          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-orange-400
                       text-sm font-medium mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to portal
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              <span className="text-3xl">🧱</span>
            </div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-1">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-2xl font-bold text-white">Staff Login</h1>
            <p className="text-slate-400 text-sm mt-1.5">
              Admin and foreman access
            </p>
          </div>

          {/* Form card */}
          <form
            onSubmit={handleLogin}
            className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20 space-y-5"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm
                             text-slate-800 placeholder:text-slate-400 outline-none
                             focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm
                             text-slate-800 placeholder:text-slate-400 outline-none
                             focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400
                             hover:text-slate-600 transition-colors"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {success && (
              <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-100 rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 leading-snug">{success}</p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 leading-snug">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800
                         disabled:bg-orange-300 disabled:cursor-not-allowed
                         text-white font-semibold py-3.5 rounded-xl transition-colors
                         flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-slate-500 text-sm mt-6">
            New to the team?{' '}
            <Link href="/induction" className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

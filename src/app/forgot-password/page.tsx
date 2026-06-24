'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, AlertCircle, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:  email.trim().toLowerCase(),
          origin: window.location.origin,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Could not send reset email. Please try again or contact the office.')
        return
      }

      setSent(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 safe-screen flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-orange-400
                       text-sm font-medium mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-1">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-2xl font-bold text-white">Reset password</h1>
            <p className="text-slate-400 text-sm mt-1.5">
              For foreman and management portal accounts
            </p>
          </div>

          {sent ? (
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20 space-y-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset
                your password. The link expires after a short time.
              </p>
              <p className="text-xs text-slate-500">
                Didn&apos;t receive it? Check spam, or try again in a few minutes.
              </p>
              <Link
                href="/login"
                className="inline-block text-orange-600 hover:text-orange-700 text-sm font-medium"
              >
                Return to login
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20 space-y-5"
            >
              <p className="text-sm text-slate-600 leading-relaxed">
                Enter the email you use to sign in. We&apos;ll send you a secure link to choose a
                new password.
              </p>

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
                               focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  />
                </div>
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
                    Sending…
                  </>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

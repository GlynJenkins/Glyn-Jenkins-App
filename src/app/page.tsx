import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-900 safe-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">🧱</span>
          </div>
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-2xl font-bold text-white">Workforce Portal</h1>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <Link
            href="/induction"
            className="block w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl transition-colors text-center"
          >
            New Worker Registration
          </Link>
          <Link
            href="/login"
            className="block w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-4 rounded-xl transition-colors text-center"
          >
            Admin / Foreman Login
          </Link>
        </div>

        <p className="text-slate-500 text-xs">
          New to the team? Tap &ldquo;New Worker Registration&rdquo; above to submit your details.
        </p>
      </div>
    </main>
  )
}

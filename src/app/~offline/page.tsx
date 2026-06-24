import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-900 safe-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto">
          <WifiOff className="w-8 h-8 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">You&apos;re offline</h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Check your connection and try again. Cached pages may still be available once you&apos;re back online.
          </p>
        </div>
        <Link
          href="/"
          className="block w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          Back to portal
        </Link>
      </div>
    </div>
  )
}

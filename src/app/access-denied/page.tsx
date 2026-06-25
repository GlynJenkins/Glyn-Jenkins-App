import { getAuthUser } from '@/lib/auth/portal-access'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import LogoutButton from '@/app/admin/_components/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function AccessDeniedPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-900 safe-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-2">
            Glyn Jenkins LTD
          </p>
          <h1 className="text-2xl font-bold text-white">No portal access</h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            You&apos;re signed in, but this account isn&apos;t linked to an active admin or
            foreman profile. Ask an administrator to check your worker record in the system,
            or sign out and try a different email.
          </p>
          <p className="text-slate-500 text-xs mt-3 font-mono break-all">{user.email}</p>
        </div>
        <LogoutButton />
        <Link href="/" className="block text-slate-500 text-sm hover:text-slate-400">
          Back to portal home
        </Link>
      </div>
    </div>
  )
}

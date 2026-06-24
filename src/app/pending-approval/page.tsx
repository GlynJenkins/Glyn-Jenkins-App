import { createServiceClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock } from 'lucide-react'
import LogoutButton from '@/app/admin/_components/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function PendingApprovalPage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServiceClient()
  const { data: worker } = await supabase
    .from('workers')
    .select('first_name, status, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (worker?.status === 'active') redirect('/dashboard')
  if (!worker) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-900 safe-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-400" />
        </div>
        <div>
          <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase mb-2">
            Glyn Jenkins LTD
          </p>
          <h1 className="text-2xl font-bold text-white">Awaiting approval</h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Hi {worker.first_name} — your registration has been received and your login
            is set up. An administrator will review your application and activate your
            account. You&apos;ll be able to sign in to the portal once that&apos;s done.
          </p>
        </div>
        <LogoutButton />
        <Link href="/" className="block text-slate-500 text-sm hover:text-slate-400">
          Back to portal home
        </Link>
      </div>
    </div>
  )
}

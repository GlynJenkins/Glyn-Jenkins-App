import { getAuthUser, getWorkerForUser } from '@/lib/auth/portal-access'
import { canAccessAdmin, canAccessJetwash } from '@/lib/worker-access'
import { allowLegacyAdmin } from '@/lib/auth/production'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Role-based routing hub.
 * After login, all users land here. We look up their role server-side
 * (service role bypasses RLS) and redirect them to the right dashboard.
 */
export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const worker = await getWorkerForUser(user.id)

  if (!worker) {
    if (!allowLegacyAdmin()) redirect('/access-denied')
    // Legacy Supabase-only admin account (no workers row)
    redirect('/admin')
  }

  if (worker.status !== 'active') redirect('/pending-approval')

  if (worker.role === 'foreman') redirect('/foreman')
  if (canAccessJetwash(worker.role)) redirect('/jetwash')
  if (canAccessAdmin(worker.role)) redirect('/admin')

  redirect('/access-denied')
}

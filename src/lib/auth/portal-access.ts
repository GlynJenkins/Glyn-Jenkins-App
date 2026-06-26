import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { canAccessAdmin, canAccessJetwash } from '@/lib/worker-access'
import { allowLegacyAdmin } from '@/lib/auth/production'

export type PortalWorker = {
  id: string
  first_name: string
  surname: string
  role: string
  status: string
}

async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

export async function getAuthUser(): Promise<User | null> {
  const supabaseAuth = await createAuthClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  return user
}

export async function getWorkerForUser(userId: string): Promise<PortalWorker | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('workers')
    .select('id, first_name, surname, role, status')
    .eq('auth_user_id', userId)
    .maybeSingle()
  return data
}

/**
 * Admin portal: `admin` and `management` roles only.
 * Legacy Supabase accounts with no workers row are allowed (owner setup).
 */
export async function requireAdminAccess(): Promise<{ user: User; worker: PortalWorker | null }> {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const worker = await getWorkerForUser(user.id)
  if (!worker) {
    if (!allowLegacyAdmin()) redirect('/access-denied')
    return { user, worker: null }
  }

  if (worker.status !== 'active') redirect('/pending-approval')
  if (!canAccessAdmin(worker.role)) redirect('/access-denied')

  return { user, worker }
}

/** Foreman portal: `foreman` role only — no admin or management access. */
export async function requireForemanAccess(): Promise<{ user: User; worker: PortalWorker }> {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const worker = await getWorkerForUser(user.id)
  if (!worker || worker.role !== 'foreman') redirect('/access-denied')
  if (worker.status !== 'active') redirect('/pending-approval')

  return { user, worker }
}

export async function verifyAdminApiAccess(): Promise<
  | { ok: true; user: User; worker: PortalWorker | null }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const worker = await getWorkerForUser(user.id)
  if (!worker) {
    if (!allowLegacyAdmin()) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
    }
    return { ok: true, user, worker: null }
  }

  if (worker.status !== 'active') {
    return { ok: false, response: NextResponse.json({ error: 'Account pending approval.' }, { status: 403 }) }
  }
  if (!canAccessAdmin(worker.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }

  return { ok: true, user, worker }
}

/** Jetwasher portal: `jetwasher` role only. */
export async function requireJetwasherAccess(): Promise<{ user: User; worker: PortalWorker }> {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const worker = await getWorkerForUser(user.id)
  if (!worker || !canAccessJetwash(worker.role)) redirect('/access-denied')
  if (worker.status !== 'active') redirect('/pending-approval')

  return { user, worker }
}

export async function verifyJetwasherApiAccess(): Promise<
  | { ok: true; user: User; worker: PortalWorker }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const worker = await getWorkerForUser(user.id)
  if (!worker || !canAccessJetwash(worker.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }
  if (worker.status !== 'active') {
    return { ok: false, response: NextResponse.json({ error: 'Account pending approval.' }, { status: 403 }) }
  }

  return { ok: true, user, worker }
}

/** Jetwash data: jetwasher or admin/management. */
export async function verifyJetwashViewAccess(): Promise<
  | { ok: true; user: User; worker: PortalWorker | null; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const worker = await getWorkerForUser(user.id)
  if (!worker) {
    if (!allowLegacyAdmin()) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
    }
    return { ok: true, user, worker: null, isAdmin: true }
  }

  if (worker.status !== 'active') {
    return { ok: false, response: NextResponse.json({ error: 'Account pending approval.' }, { status: 403 }) }
  }

  if (canAccessJetwash(worker.role) || canAccessAdmin(worker.role)) {
    return { ok: true, user, worker, isAdmin: canAccessAdmin(worker.role) }
  }

  return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
}

/** Mark plots washed: jetwasher or admin/management. */
export async function verifyJetwashMarkAccess(): Promise<
  | { ok: true; user: User; worker: PortalWorker | null; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  return verifyJetwashViewAccess()
}

export async function verifyForemanApiAccess(): Promise<
  | { ok: true; user: User; worker: PortalWorker }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const worker = await getWorkerForUser(user.id)
  if (!worker || worker.role !== 'foreman') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }
  if (worker.status !== 'active') {
    return { ok: false, response: NextResponse.json({ error: 'Account pending approval.' }, { status: 403 }) }
  }

  return { ok: true, user, worker }
}

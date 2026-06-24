import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canAccessAdmin, canAccessForeman } from '@/lib/worker-access'
import { allowLegacyAdmin } from '@/lib/auth/production'

const PUBLIC_API_PREFIXES = [
  '/api/induction',
  '/api/auth/forgot-password',
]

const ADMIN_API_PREFIXES = [
  '/api/admin/',
  '/api/cells/',
  '/api/sites/',
  '/api/workers/',
  '/api/variations/batch',
]

const ADMIN_CLAIM_ACTIONS = ['/approve', '/reject', '/regenerate-ledger']

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
}

function isAdminApi(pathname: string): boolean {
  if (ADMIN_API_PREFIXES.some((p) => pathname.startsWith(p))) return true
  if (pathname.startsWith('/api/claims/') && ADMIN_CLAIM_ACTIONS.some((a) => pathname.endsWith(a))) {
    return true
  }
  if (pathname.startsWith('/api/variations/') && !pathname.startsWith('/api/variations/batch')) {
    // /api/variations/[id] — admin approve/reject
    return pathname !== '/api/variations'
  }
  return false
}

function isTestApi(pathname: string): boolean {
  return pathname.startsWith('/api/test-')
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── API route guards ───────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (isTestApi(pathname)) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      }
    }

    if (isPublicApi(pathname)) {
      return response
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    if (isAdminApi(pathname)) {
      const service = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: worker } = await service
        .from('workers')
        .select('role, status')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      const legacyOk = !worker && allowLegacyAdmin()
      const adminOk  = worker?.status === 'active' && canAccessAdmin(worker.role)

      if (!legacyOk && !adminOk) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
      }
    }

    return response
  }

  // Protect /admin, /foreman, /dashboard — redirect to login if not authenticated
  if (
    (pathname.startsWith('/admin') ||
     pathname.startsWith('/foreman') ||
     pathname.startsWith('/dashboard')) && !user
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Role-based route guards (foreman ≠ admin, management = admin)
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/foreman'))) {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: worker } = await service
      .from('workers')
      .select('role, status')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!worker) {
      if (pathname.startsWith('/admin') && !allowLegacyAdmin()) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      return response
    }

    if (worker.status !== 'active') {
      return NextResponse.redirect(new URL('/pending-approval', request.url))
    }

    if (pathname.startsWith('/admin')) {
      if (!canAccessAdmin(worker.role)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }

    if (pathname.startsWith('/foreman')) {
      if (!canAccessForeman(worker.role)) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  // Redirect already-logged-in users to role router (not straight to admin)
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/foreman/:path*',
    '/dashboard/:path*',
    '/login',
    '/api/:path*',
  ],
}

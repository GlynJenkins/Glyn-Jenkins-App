import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_API_PREFIXES = [
  '/api/induction',
  '/api/auth/forgot-password',
]

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
}

function isTestApi(pathname: string): boolean {
  return pathname.startsWith('/api/test-')
}

function supabaseEnvOk(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !!url && !!key && /^https?:\/\//.test(url)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!supabaseEnvOk()) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  try {
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
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

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

      return response
    }

    if (
      (pathname.startsWith('/admin') ||
        pathname.startsWith('/foreman') ||
        pathname.startsWith('/dashboard')) &&
      !user
    ) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (pathname === '/login' && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return response
  } catch {
    return NextResponse.next()
  }
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

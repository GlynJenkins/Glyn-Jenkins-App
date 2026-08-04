import { createBrowserClient } from '@supabase/ssr'

function requirePublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !key) {
    throw new Error('Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`Supabase URL must start with https:// — check NEXT_PUBLIC_SUPABASE_URL (got "${url.slice(0, 20)}…").`)
  }

  return { url, key }
}

export const createClient = () => {
  const { url, key } = requirePublicSupabaseEnv()
  // Explicit cookie options help Chrome keep the session across visits
  // (Safari is more forgiving with defaults).
  return createBrowserClient(url, key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : true,
      maxAge: 60 * 60 * 24 * 400, // ~400 days — matches modern browser cookie caps
    },
  })
}

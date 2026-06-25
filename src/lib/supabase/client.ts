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
  return createBrowserClient(url, key)
}

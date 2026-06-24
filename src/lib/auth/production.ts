/** True when running a production build (`next build` / Vercel production). */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Legacy Supabase auth accounts with no `workers` row were allowed admin access
 * during initial setup. Disabled in production unless explicitly opted in.
 */
export function allowLegacyAdmin(): boolean {
  if (!isProduction()) return true
  return process.env.ALLOW_LEGACY_ADMIN === 'true'
}

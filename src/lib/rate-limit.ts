import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { NextRequest } from 'next/server'

type RateLimitResult = {
  success: boolean
  /** Remaining requests in the window (best-effort). */
  remaining?: number
}

type LimiterConfig = {
  /** Max successful requests in the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Prefix for Redis keys / in-memory maps. */
  prefix: string
}

/** First IP in x-forwarded-for (Vercel sets this). */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

// ── In-memory fallback (per-instance; resets on redeploy) ────────────────────

const memoryBuckets = new Map<string, number[]>()

function memoryLimit(key: string, cfg: LimiterConfig): RateLimitResult {
  const now = Date.now()
  const cutoff = now - cfg.windowMs
  const prev = memoryBuckets.get(key) ?? []
  const recent = prev.filter((t) => t > cutoff)
  if (recent.length >= cfg.limit) {
    memoryBuckets.set(key, recent)
    return { success: false, remaining: 0 }
  }
  recent.push(now)
  memoryBuckets.set(key, recent)
  return { success: true, remaining: cfg.limit - recent.length }
}

// ── Upstash (preferred when env vars are present) ────────────────────────────

const upstashReady =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

const upstashLimiters = new Map<string, Ratelimit>()

function getUpstashLimiter(cfg: LimiterConfig): Ratelimit {
  const existing = upstashLimiters.get(cfg.prefix)
  if (existing) return existing

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(cfg.limit, `${Math.ceil(cfg.windowMs / 1000)} s`),
    prefix: `gj:${cfg.prefix}`,
    analytics: false,
  })
  upstashLimiters.set(cfg.prefix, limiter)
  return limiter
}

/**
 * Rate-limit by IP. Uses Upstash Redis when configured; otherwise an
 * in-memory sliding window (weaker on multi-instance hosts, still useful).
 */
export async function rateLimit(
  request: NextRequest,
  cfg: LimiterConfig,
): Promise<RateLimitResult> {
  const ip = clientIp(request)
  const key = `${cfg.prefix}:${ip}`

  if (upstashReady) {
    try {
      const result = await getUpstashLimiter(cfg).limit(key)
      return { success: result.success, remaining: result.remaining }
    } catch (err) {
      console.error('[rate-limit] Upstash failed — falling back to memory:', err)
    }
  }

  return memoryLimit(key, cfg)
}

/** Public registration: 5 submissions per IP per 10 minutes. */
export const INDUCTION_RATE_LIMIT: LimiterConfig = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
  prefix: 'induction',
}

/** Forgot-password: 5 attempts per IP per 10 minutes. */
export const FORGOT_PASSWORD_RATE_LIMIT: LimiterConfig = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
  prefix: 'forgot-password',
}

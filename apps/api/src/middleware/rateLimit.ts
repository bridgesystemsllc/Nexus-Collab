import type { Response, NextFunction } from 'express'
import { sendError, requestIdOf, type RbacRequest } from './requirePermission'

// ─── Rate limiting ───────────────────────────────────────────
// A fixed window per key, held in process memory.
//
// In-memory is a real limitation and worth naming: the deployment target is
// Cloud Run, so two instances mean two independent counters and the effective
// limit doubles. That is acceptable for what these guard — accidental
// double-submits and a single actor spraying invitations — and it is not
// acceptable for anything protecting a credential. There are no credentials
// here (Nexus is SSO-only), so nothing in this module needs the stronger
// guarantee. If one ever does, this moves to Redis, which the worker already
// has a connection to.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Unbounded growth would be a slow leak on a long-lived process. Sweeping on
// write costs nothing and keeps the map proportional to active users.
let lastSweep = Date.now()
const SWEEP_INTERVAL_MS = 5 * 60_000

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/** Pure enough to test: the store is module-level, the decision is not. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return { allowed: true, remaining: limit - 1, resetAt: bucket.resetAt }
  }

  existing.count++
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  }
}

/** Test seam. Never called in production code. */
export function __resetRateLimits(): void {
  buckets.clear()
  lastSweep = 0
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
  /// Defaults to the acting member — the actor is who a per-actor limit means.
  keyBy?: (req: RbacRequest) => string
  message?: string
}

export function rateLimit(name: string, opts: RateLimitOptions) {
  return (req: RbacRequest, res: Response, next: NextFunction): void => {
    const who = opts.keyBy?.(req) ?? req.subject?.id ?? (req as any).member?.id ?? req.ip ?? 'anonymous'
    const result = hit(`${name}:${who}`, opts.limit, opts.windowMs)

    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
    res.setHeader('X-RateLimit-Limit', String(opts.limit))
    res.setHeader('X-RateLimit-Remaining', String(result.remaining))

    if (!result.allowed) {
      res.setHeader('Retry-After', String(retryAfter))
      sendError(
        res,
        'RATE_LIMITED',
        opts.message ?? `Too many requests. Try again in ${retryAfter} seconds.`,
        { retryAfter, requestId: requestIdOf(req) },
      )
      return
    }

    next()
  }
}

/** 20 invitations an hour per actor (§6.7). */
export const inviteRateLimit = rateLimit('invite', {
  limit: 20,
  windowMs: 60 * 60_000,
  message: 'You have sent a lot of invitations in the last hour. Try again shortly.',
})

/**
 * 5 email-change requests an hour per member.
 *
 * §6.7 sets this budget for password changes. There are no passwords here, and
 * changing the address a session recovers to is the same kind of operation —
 * it moves where account control lives.
 */
export const emailChangeRateLimit = rateLimit('email-change', {
  limit: 5,
  windowMs: 60 * 60_000,
  message: 'Too many email change attempts. Try again in an hour.',
})

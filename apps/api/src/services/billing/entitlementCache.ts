import Redis from 'ioredis'
import type { Entitlements } from '@nexus/shared'

// ─── Entitlement cache ───────────────────────────────────────
// 60s TTL, hard-invalidated by every webhook that touches the org. The TTL is
// a backstop for an invalidation we missed, not the primary mechanism — a
// customer who has just paid should not wait a minute for their features.
//
// Redis when REDIS_URL is set, an in-process map otherwise. Redis is optional
// in this deployment (only the BullMQ worker requires it), and a cache that
// hard-required it would take billing offline wherever it is absent.
//
// The in-process variant is per-instance, so on a multi-instance deploy one
// instance can serve up to 60s of stale entitlements after another instance
// invalidates. Acceptable for a read cache whose miss path is correct and
// whose worst case is a feature appearing a minute late. NOT acceptable if
// anything ever starts making a money decision from it — that must re-read.

const TTL_MS = 60_000
const TTL_S = 60

const key = (orgId: string) => `nexus:entitlements:${orgId}`

let redis: Redis | null = null
let redisTried = false

function getRedis(): Redis | null {
  if (redisTried) return redis
  redisTried = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })
    redis.on('error', (err) => console.error('[billing] entitlement cache redis error:', err.message))
  } catch (err) {
    console.error('[billing] could not open the entitlement cache:', err)
    redis = null
  }
  return redis
}

const local = new Map<string, { at: number; value: Entitlements }>()

export async function getCached(orgId: string): Promise<Entitlements | null> {
  const client = getRedis()
  if (client) {
    try {
      const raw = await client.get(key(orgId))
      return raw ? (JSON.parse(raw) as Entitlements) : null
    } catch (err) {
      // A cache read that fails is a miss, never an error. The caller then
      // resolves from the database, which is always correct.
      console.error('[billing] entitlement cache read failed:', err)
      return null
    }
  }
  const hit = local.get(orgId)
  if (!hit) return null
  if (Date.now() - hit.at >= TTL_MS) {
    local.delete(orgId)
    return null
  }
  return hit.value
}

export async function setCached(orgId: string, value: Entitlements): Promise<void> {
  const client = getRedis()
  if (client) {
    try {
      await client.set(key(orgId), JSON.stringify(value), 'EX', TTL_S)
      return
    } catch (err) {
      console.error('[billing] entitlement cache write failed:', err)
      return
    }
  }
  local.set(orgId, { at: Date.now(), value })
}

/** Called by every webhook that touches the org, as its last step. */
export async function invalidateEntitlements(orgId: string): Promise<void> {
  local.delete(orgId)
  const client = getRedis()
  if (!client) return
  try {
    await client.del(key(orgId))
  } catch (err) {
    // A failed invalidation is the one cache error that matters: it leaves
    // stale entitlements for up to the TTL. Loud, but not fatal — the TTL
    // bounds the damage, which is exactly why the TTL exists.
    console.error(`[billing] could not invalidate entitlements for ${orgId}:`, err)
  }
}

/** Test hook. Never call this from application code. */
export function resetCacheForTests(): void {
  local.clear()
  redis = null
  redisTried = true
}

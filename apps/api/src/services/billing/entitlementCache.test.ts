import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCached, setCached, invalidateEntitlements, resetCacheForTests } from './entitlementCache'
import type { Entitlements } from '@nexus/shared'

const ent = (tier: string): Entitlements => ({
  tier: tier as any, status: 'active', accessLevel: 'full',
  features: {} as any,
  limits: { seats: { purchased: 5, consumed: 2, available: 3 }, activeBriefs: null, apiCallsPerMonth: null },
  inGracePeriod: false, gracePeriodEndsAt: null,
})

beforeEach(() => resetCacheForTests())

describe('entitlementCache (in-process fallback)', () => {
  it('returns null on a miss', async () => {
    expect(await getCached('org_a')).toBeNull()
  })

  it('round-trips a value', async () => {
    await setCached('org_a', ent('growth'))
    expect((await getCached('org_a'))?.tier).toBe('growth')
  })

  it('keeps organizations separate', async () => {
    await setCached('org_a', ent('growth'))
    await setCached('org_b', ent('starter'))
    expect((await getCached('org_a'))?.tier).toBe('growth')
    expect((await getCached('org_b'))?.tier).toBe('starter')
  })

  it('invalidates one org without touching another', async () => {
    await setCached('org_a', ent('growth'))
    await setCached('org_b', ent('starter'))
    await invalidateEntitlements('org_a')
    expect(await getCached('org_a')).toBeNull()
    expect((await getCached('org_b'))?.tier).toBe('starter')
  })

  it('expires after the 60s TTL', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    await setCached('org_a', ent('growth'))
    now.mockReturnValue(1_000 + 59_000)
    expect(await getCached('org_a')).not.toBeNull()
    now.mockReturnValue(1_000 + 61_000)
    expect(await getCached('org_a')).toBeNull()
    now.mockRestore()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entitlements } from '@nexus/shared'

// The repo's established mocking shape (see services/emailAgent/processor.test.ts):
// a hoisted spy, and a factory that forwards to it lazily. The indirection is
// what lets `vi.mock` hoist above a plain static import without tripping the
// spy's TDZ — the arrow is only *called* once a test runs, by which time the
// const is initialised. Do not reach for a top-level `await import` here:
// apps/api compiles as CommonJS, and top-level await is not available to it.
const resolveEntitlements = vi.fn()
vi.mock('../services/billing/entitlements', () => ({
  resolveEntitlements: (...a: any[]) => resolveEntitlements(...a),
}))

import { requireFeature, requireSeatAvailable, requireWriteAccess } from './requireEntitlement'

const ent = (over: Partial<Entitlements> = {}): Entitlements => ({
  tier: 'growth', status: 'active', accessLevel: 'full',
  features: { formulations: true, scim: false } as any,
  limits: { seats: { purchased: 5, consumed: 2, available: 3 }, activeBriefs: null, apiCallsPerMonth: null },
  inGracePeriod: false, gracePeriodEndsAt: null, ...over,
})

function ctx(member: unknown = { id: 'm1', orgId: 'org_a' }) {
  const res: any = {
    statusCode: 0, body: null as any, req: { headers: {} },
    status(c: number) { this.statusCode = c; return this },
    json(b: unknown) { this.body = b; return this },
  }
  return { req: { member, body: {}, params: {}, query: {}, headers: {} } as any, res, next: vi.fn() }
}

beforeEach(() => { resolveEntitlements.mockReset() })

describe('requireFeature', () => {
  it('passes when the feature is enabled', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireFeature('formulations')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses with 402 when the feature is not on the plan', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireFeature('scim')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED')
    // The refusal names what is needed so the UI can offer the upgrade.
    expect(res.body.error.requiredFeature).toBe('scim')
  })

  it('refuses when resolution throws — fails closed', async () => {
    resolveEntitlements.mockRejectedValue(new Error('db down'))
    const { req, res, next } = ctx()
    await requireFeature('formulations')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
  })

  it('refuses when nobody is signed in', async () => {
    // Not ctx(undefined): a JS default parameter activates on a literal
    // `undefined` argument, so that call would silently fall back to the
    // signed-in default member instead of simulating no session. `null`
    // bypasses the default and reaches `load()` as an absent member.
    const { req, res, next } = ctx(null)
    await requireFeature('formulations')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(resolveEntitlements).not.toHaveBeenCalled()
  })
})

describe('requireWriteAccess', () => {
  it('passes on full access', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses a write in read-only lockout', async () => {
    resolveEntitlements.mockResolvedValue(ent({ accessLevel: 'read_only' }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(res.statusCode).toBe(402)
    expect(res.body.error.code).toBe('SUBSCRIPTION_READ_ONLY')
  })

  it('refuses a write when locked', async () => {
    resolveEntitlements.mockResolvedValue(ent({ accessLevel: 'locked' }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(res.statusCode).toBe(402)
  })

  it('passes while past_due inside the grace period', async () => {
    resolveEntitlements.mockResolvedValue(ent({ status: 'past_due', accessLevel: 'full', inGracePeriod: true }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses when resolution throws — fails closed', async () => {
    resolveEntitlements.mockRejectedValue(new Error('db down'))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
  })

  it('refuses when nobody is signed in', async () => {
    const { req, res, next } = ctx(null)
    await requireWriteAccess()(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(resolveEntitlements).not.toHaveBeenCalled()
  })
})

describe('requireSeatAvailable', () => {
  it('passes when a seat is free', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireSeatAvailable()(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses with 409 when every seat is taken', async () => {
    resolveEntitlements.mockResolvedValue(ent({
      limits: { seats: { purchased: 5, consumed: 5, available: 0 }, activeBriefs: null, apiCallsPerMonth: null },
    }))
    const { req, res, next } = ctx()
    await requireSeatAvailable()(req, res, next)
    expect(res.statusCode).toBe(409)
    expect(res.body.error.code).toBe('NO_SEATS_AVAILABLE')
    // The UI turns this into "adding this user requires 1 additional seat",
    // so the numbers have to travel with the refusal.
    expect(res.body.error.seats).toEqual({ purchased: 5, consumed: 5, available: 0 })
  })

  it('refuses when resolution throws — fails closed', async () => {
    resolveEntitlements.mockRejectedValue(new Error('db down'))
    const { req, res, next } = ctx()
    await requireSeatAvailable()(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
  })

  it('refuses when nobody is signed in', async () => {
    const { req, res, next } = ctx(null)
    await requireSeatAvailable()(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(resolveEntitlements).not.toHaveBeenCalled()
  })
})

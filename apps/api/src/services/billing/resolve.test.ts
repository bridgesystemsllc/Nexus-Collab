import { describe, it, expect } from 'vitest'
import { resolve, type SubscriptionSnapshot } from './resolve'
import type { TierRecord } from './catalogue'

const NOW = new Date('2026-08-25T12:00:00Z')
const PAST = new Date('2026-08-20T12:00:00Z')
const FUTURE = new Date('2026-09-20T12:00:00Z')

const GROWTH: TierRecord = {
  id: 't_growth', key: 'growth', displayName: 'Growth', description: null,
  sortOrder: 20, rank: 20, stripePriceIdMonthly: 'price_m', stripePriceIdAnnual: 'price_a',
  unitAmountMonthlyCents: 5900, unitAmountAnnualCents: 59000,
  minSeats: 5, maxSeats: 50, isCustomQuote: false,
  features: [
    { featureKey: 'projects_core', isEnabled: true, limitValue: null },
    { featureKey: 'api_read', isEnabled: true, limitValue: 10_000 },
    { featureKey: 'active_briefs', isEnabled: true, limitValue: 25 },
    { featureKey: 'formulations', isEnabled: false, limitValue: null },
  ],
}

const sub = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: 'active', seatsPurchased: 10, gracePeriodEndsAt: null,
  currentPeriodEnd: FUTURE, cancelAtPeriodEnd: false, ...over,
})

const run = (s: SubscriptionSnapshot | null, seatsConsumed = 4, tier: TierRecord | null = GROWTH) =>
  resolve({ subscription: s, tier, features: tier?.features ?? [], seatsConsumed, now: NOW })

describe('resolve — no subscription', () => {
  it('locks everything', () => {
    const e = run(null, 0, null)
    expect(e.tier).toBeNull()
    expect(e.status).toBeNull()
    expect(e.accessLevel).toBe('locked')
    expect(Object.values(e.features).every((v) => v === false)).toBe(true)
  })

  it('reports zero seats rather than undefined', () => {
    expect(run(null, 0, null).limits.seats).toEqual({ purchased: 0, consumed: 0, available: 0 })
  })
})

describe('resolve — the status matrix', () => {
  it('grants full access while trialing', () => expect(run(sub({ status: 'trialing' })).accessLevel).toBe('full'))
  it('grants full access while active', () => expect(run(sub()).accessLevel).toBe('full'))

  it('grants full access while past_due inside the grace period', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: FUTURE }))
    expect(e.accessLevel).toBe('full')
    expect(e.inGracePeriod).toBe(true)
    expect(e.features.api_read).toBe(true)
  })

  it('drops to read-only when the grace period has expired', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: PAST }))
    expect(e.accessLevel).toBe('read_only')
    expect(e.inGracePeriod).toBe(false)
    // Read-only refuses writes. It does not hide or delete anything — the spec
    // is explicit that lockout is never data loss.
    expect(e.features.api_read).toBe(true)
  })

  it('treats past_due with no grace period set as read-only', () => {
    expect(run(sub({ status: 'past_due', gracePeriodEndsAt: null })).accessLevel).toBe('read_only')
  })

  it('locks an incomplete subscription and grants nothing', () => {
    // Edge case 3: payment failed on upgrade. No new entitlements until paid.
    const e = run(sub({ status: 'incomplete' }))
    expect(e.accessLevel).toBe('locked')
    expect(Object.values(e.features).every((v) => v === false)).toBe(true)
  })

  it('locks an incomplete_expired subscription', () => {
    expect(run(sub({ status: 'incomplete_expired' })).accessLevel).toBe('locked')
  })

  it('makes a paused subscription read-only', () => {
    expect(run(sub({ status: 'paused' })).accessLevel).toBe('read_only')
  })

  it('keeps full access after cancellation until the period actually ends', () => {
    // Edge case 9 depends on this: cancel then reactivate before period end
    // must never have cost anyone access in between.
    expect(run(sub({ status: 'canceled', currentPeriodEnd: FUTURE })).accessLevel).toBe('full')
  })

  it('drops to read-only once a canceled period has ended', () => {
    expect(run(sub({ status: 'canceled', currentPeriodEnd: PAST })).accessLevel).toBe('read_only')
  })

  it('treats a canceled subscription with no period end as read-only', () => {
    expect(run(sub({ status: 'canceled', currentPeriodEnd: null })).accessLevel).toBe('read_only')
  })
})

describe('resolve — features', () => {
  it('enables what the tier enables', () => {
    expect(run(sub()).features.projects_core).toBe(true)
    expect(run(sub()).features.api_read).toBe(true)
  })

  it('disables what the tier disables', () => {
    expect(run(sub()).features.formulations).toBe(false)
  })

  it('defaults an unlisted feature to false, never undefined', () => {
    // A missing key must read as "no", not as undefined — `if (!features.x)`
    // and `if (features.x === false)` have to agree.
    expect(run(sub()).features.scim).toBe(false)
    expect(run(sub()).features).toHaveProperty('scim')
  })
})

describe('resolve — limits', () => {
  it('reports seat purchased, consumed and available', () => {
    expect(run(sub({ seatsPurchased: 10 }), 4).limits.seats)
      .toEqual({ purchased: 10, consumed: 4, available: 6 })
  })

  it('clamps available at zero when oversold', () => {
    expect(run(sub({ seatsPurchased: 10 }), 12).limits.seats.available).toBe(0)
  })

  it('carries numeric limits from the feature rows', () => {
    const e = run(sub())
    expect(e.limits.apiCallsPerMonth).toBe(10_000)
    expect(e.limits.activeBriefs).toBe(25)
  })

  it('reports null for an absent limit, meaning unlimited', () => {
    const noLimits: TierRecord = { ...GROWTH, features: [{ featureKey: 'projects_core', isEnabled: true, limitValue: null }] }
    const e = resolve({ subscription: sub(), tier: noLimits, features: noLimits.features, seatsConsumed: 1, now: NOW })
    expect(e.limits.activeBriefs).toBeNull()
    expect(e.limits.apiCallsPerMonth).toBeNull()
  })

  it('reports no limits at all when locked', () => {
    const e = run(sub({ status: 'incomplete' }))
    expect(e.limits.activeBriefs).toBe(0)
    expect(e.limits.apiCallsPerMonth).toBe(0)
  })
})

describe('resolve — grace period reporting', () => {
  it('exposes the end date as ISO 8601', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: FUTURE }))
    expect(e.gracePeriodEndsAt).toBe(FUTURE.toISOString())
  })

  it('is null when not in grace', () => {
    expect(run(sub()).gracePeriodEndsAt).toBeNull()
    expect(run(sub()).inGracePeriod).toBe(false)
  })

  it('only reports grace for past_due, never for an active subscription', () => {
    // A stale gracePeriodEndsAt left behind by a recovered payment must not
    // make an active subscription render a dunning banner.
    const e = run(sub({ status: 'active', gracePeriodEndsAt: FUTURE }))
    expect(e.inGracePeriod).toBe(false)
    expect(e.gracePeriodEndsAt).toBeNull()
  })
})

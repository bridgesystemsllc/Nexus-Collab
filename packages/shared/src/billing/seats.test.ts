// packages/shared/src/billing/seats.test.ts
import { describe, it, expect } from 'vitest'
import { exceedsSeatCeiling, seatsAvailable } from './seats'
import { TIER_CATALOGUE } from './tiers'

// Edge case 14 in the spec: Enterprise has no seat ceiling, expressed as null.
// A bare `seats > tier.maxSeats` is `false` for null, which reads as "no
// ceiling" by accident and as "ceiling of zero" if anyone ever coerces it.
// These tests exist so nobody writes that comparison inline.

describe('exceedsSeatCeiling', () => {
  it('is false below the ceiling', () => expect(exceedsSeatCeiling(14, 15)).toBe(false))
  it('is false exactly at the ceiling', () => expect(exceedsSeatCeiling(15, 15)).toBe(false))
  it('is true above the ceiling', () => expect(exceedsSeatCeiling(16, 15)).toBe(true))

  it('is never true when the ceiling is null (unlimited)', () => {
    expect(exceedsSeatCeiling(1, null)).toBe(false)
    expect(exceedsSeatCeiling(1_000_000, null)).toBe(false)
  })
})

describe('seatsAvailable', () => {
  it('is the difference', () => expect(seatsAvailable(15, 12)).toBe(3))
  it('is zero when full', () => expect(seatsAvailable(15, 15)).toBe(0))

  it('clamps at zero when oversold', () => {
    // Should be unreachable — the DB trigger forbids it — but a negative
    // "available" would render as "-2 seats available" in the UI, and a bug
    // that shows a wrong number is worse than one that shows none.
    expect(seatsAvailable(15, 17)).toBe(0)
  })
})

describe('TIER_CATALOGUE', () => {
  it('has the four tiers in rank order', () => {
    expect(TIER_CATALOGUE.map((t) => t.key))
      .toEqual(['starter', 'growth', 'professional', 'enterprise'])
    expect(TIER_CATALOGUE.map((t) => t.rank)).toEqual([...TIER_CATALOGUE.map((t) => t.rank)].sort((a, b) => a - b))
  })

  it('prices the annual plan at ten months, matching the "save ~17%" claim', () => {
    for (const t of TIER_CATALOGUE.filter((t) => !t.isCustomQuote)) {
      expect(t.unitAmountAnnualCents).toBe(t.unitAmountMonthlyCents * 10)
    }
  })

  it('gives every non-quote tier a seat ceiling above its floor', () => {
    for (const t of TIER_CATALOGUE) {
      expect(t.minSeats).toBeGreaterThan(0)
      if (t.maxSeats !== null) expect(t.maxSeats).toBeGreaterThanOrEqual(t.minSeats)
    }
  })

  it('makes each tier a superset of the one below it', () => {
    // The comparison table in the Plans screen renders as a ladder. A tier
    // that dropped a feature the tier below it has would render as a downgrade
    // dressed as an upgrade.
    for (let i = 1; i < TIER_CATALOGUE.length; i++) {
      const lower = TIER_CATALOGUE[i - 1].features.filter((f) => f.isEnabled).map((f) => f.featureKey)
      const upper = new Set(TIER_CATALOGUE[i].features.filter((f) => f.isEnabled).map((f) => f.featureKey))
      for (const key of lower) expect(upper.has(key)).toBe(true)
    }
  })

  it('marks only Enterprise as quote-driven, with no ceiling', () => {
    const quoted = TIER_CATALOGUE.filter((t) => t.isCustomQuote)
    expect(quoted.map((t) => t.key)).toEqual(['enterprise'])
    expect(quoted[0].maxSeats).toBeNull()
  })
})

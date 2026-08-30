// apps/api/src/services/billing/proration.test.ts
import { describe, it, expect } from 'vitest'
import { planFor } from './proration'

// The §3.2 decision table, one test per row. These are money rules: an upgrade
// that fails to charge, or a downgrade that refunds, is a revenue bug that
// nobody notices until reconciliation.

describe('planFor — tier changes', () => {
  it('charges an upgrade immediately, prorated', () => {
    expect(planFor({ kind: 'tier', fromRank: 10, toRank: 20 }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers a downgrade to period end with no proration and no refund', () => {
    expect(planFor({ kind: 'tier', fromRank: 30, toRank: 10 }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('treats an unchanged tier as a no-op, not an upgrade', () => {
    expect(planFor({ kind: 'tier', fromRank: 20, toRank: 20 }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — seat changes', () => {
  it('charges a seat increase immediately, prorated', () => {
    expect(planFor({ kind: 'seats', from: 5, to: 8 }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers a seat decrease to period end', () => {
    expect(planFor({ kind: 'seats', from: 8, to: 5 }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('never makes a seat decrease immediate, at any magnitude', () => {
    // The credit-farming guard. Immediate decrease + immediate increase is a
    // loop that mints proration credit; deferring the decrease closes it.
    // Parameterised because "just this one case" is how the hole gets reopened.
    for (const [from, to] of [[2, 1], [50, 49], [250, 1], [10, 9]]) {
      const plan = planFor({ kind: 'seats', from, to })
      expect(plan.timing).toBe('period_end')
      expect(plan.chargeNow).toBe(false)
      expect(plan.prorate).toBe(false)
    }
  })

  it('treats an unchanged seat count as a no-op', () => {
    expect(planFor({ kind: 'seats', from: 5, to: 5 }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — interval changes', () => {
  it('charges monthly → annual immediately, prorated', () => {
    expect(planFor({ kind: 'interval', from: 'monthly', to: 'annual' }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers annual → monthly to period end', () => {
    // Immediate would mean refunding the unused annual term. Deferring is what
    // keeps that from being a withdrawal mechanism.
    expect(planFor({ kind: 'interval', from: 'annual', to: 'monthly' }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('treats an unchanged interval as a no-op', () => {
    expect(planFor({ kind: 'interval', from: 'monthly', to: 'monthly' }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — cancellation', () => {
  it('defers cancellation to period end, retaining paid access', () => {
    expect(planFor({ kind: 'cancel' }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })
})

describe('planFor — invariants that must hold for every input', () => {
  const ALL: Parameters<typeof planFor>[0][] = [
    { kind: 'tier', fromRank: 10, toRank: 20 },
    { kind: 'tier', fromRank: 30, toRank: 10 },
    { kind: 'tier', fromRank: 20, toRank: 20 },
    { kind: 'seats', from: 5, to: 8 },
    { kind: 'seats', from: 8, to: 5 },
    { kind: 'seats', from: 5, to: 5 },
    { kind: 'interval', from: 'monthly', to: 'annual' },
    { kind: 'interval', from: 'annual', to: 'monthly' },
    { kind: 'interval', from: 'monthly', to: 'monthly' },
    { kind: 'cancel' },
  ]

  it('never charges now without prorating', () => {
    // Charging an unprorated amount mid-period bills for time already paid for.
    for (const c of ALL) {
      const p = planFor(c)
      if (p.chargeNow) expect(p.prorate).toBe(true)
    }
  })

  it('never charges now on a deferred change', () => {
    // A period_end change that takes money today is the refund-abuse shape.
    for (const c of ALL) {
      const p = planFor(c)
      if (p.timing === 'period_end') expect(p.chargeNow).toBe(false)
    }
  })

  it('never prorates a deferred change', () => {
    for (const c of ALL) {
      const p = planFor(c)
      if (p.timing === 'period_end') expect(p.prorate).toBe(false)
    }
  })
})

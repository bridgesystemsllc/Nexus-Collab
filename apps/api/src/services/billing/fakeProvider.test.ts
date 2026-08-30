// apps/api/src/services/billing/fakeProvider.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createFakeProvider, type FakeProvider } from './fakeProvider'
import { BillingProviderError } from './provider'
import { planFor } from './proration'

// The fake is a test dependency, so its own contract has to hold or every suite
// built on it is testing a fiction. These tests pin the behaviours other suites
// will rely on: deterministic ids, an injected clock, idempotency, and the
// ability to make a call fail on demand.

const NOW = new Date('2026-09-01T00:00:00Z')
let p: FakeProvider

beforeEach(() => { p = createFakeProvider({ now: NOW }) })

describe('createFakeProvider — determinism', () => {
  it('issues sequential customer ids', async () => {
    const a = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const b = await p.ensureCustomer({ orgId: 'o2', name: 'B', email: 'b@x.com', idempotencyKey: 'k2' })
    expect(a.customerId).toBe('cus_fake_1')
    expect(b.customerId).toBe('cus_fake_2')
  })

  it('uses the injected clock, never the wall clock', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k3' })
    expect(sub.currentPeriodStart).toEqual(NOW)
    expect(sub.updatedAt).toEqual(NOW)
  })
})

describe('createFakeProvider — idempotency', () => {
  it('returns the same customer for a repeated key', async () => {
    const a = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const b = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    expect(b.customerId).toBe(a.customerId)
    expect(Object.keys(p.state.customers)).toHaveLength(1)
  })

  it('applies a repeated change once', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const input = {
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'seat-8',
    }
    await p.applyChange(input)
    const second = await p.applyChange(input)
    expect(second.quantity).toBe(8)
    expect(p.state.appliedChanges).toHaveLength(1)
  })
})

describe('createFakeProvider — change semantics mirror the decision table', () => {
  it('applies an immediate change to quantity right away', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const out = await p.applyChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'up',
    })
    expect(out.quantity).toBe(8)
  })

  it('leaves quantity untouched for a deferred change', async () => {
    // A period_end change must NOT be visible on the subscription yet — that is
    // what makes "scheduled downgrade keeps its features" testable upstream.
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    const out = await p.applyChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 5,
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'down',
    })
    expect(out.quantity).toBe(8)
    expect(p.state.scheduledChanges).toHaveLength(1)
  })
})

describe('createFakeProvider — previewChange', () => {
  it('returns zero immediate charge for a deferred change', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    const preview = await p.previewChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 5,
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'prev',
    })
    expect(preview.immediateChargeCents).toBe(0)
    expect(preview.effectiveImmediately).toBe(false)
  })

  it('returns a positive immediate charge for an upgrade', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const preview = await p.previewChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'prev',
    })
    expect(preview.immediateChargeCents).toBeGreaterThan(0)
    expect(preview.effectiveImmediately).toBe(true)
  })

  it('never returns a negative charge', async () => {
    // Money is unsigned here; a credit belongs in creditAppliedCents.
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    for (const q of [1, 5, 8, 20]) {
      const preview = await p.previewChange({
        subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: q,
        plan: planFor({ kind: 'seats', from: 8, to: q }), idempotencyKey: `p${q}`,
      })
      expect(preview.immediateChargeCents).toBeGreaterThanOrEqual(0)
      expect(preview.creditAppliedCents).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('createFakeProvider — failure injection', () => {
  it('fails the next call with the given code, once', async () => {
    p.failNext('card_declined', false)
    await expect(
      p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' }),
    ).rejects.toThrow(BillingProviderError)
    // The injection is one-shot; the next call succeeds.
    await expect(
      p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k2' }),
    ).resolves.toHaveProperty('customerId')
  })

  it('carries the retryable flag through', async () => {
    p.failNext('rate_limit', true)
    await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
      .catch((e: BillingProviderError) => {
        expect(e.code).toBe('rate_limit')
        expect(e.retryable).toBe(true)
      })
  })
})

describe('createFakeProvider — webhook verification', () => {
  it('rejects a bad signature', () => {
    expect(() => p.verifyWebhook(Buffer.from('{}'), 'nope')).toThrow()
  })

  it('accepts the sentinel signature and returns the parsed event', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'invoice.paid', created: 1756684800, data: { object: { id: 'in_1' } } }))
    const ev = p.verifyWebhook(body, 'fake-valid-signature')
    expect(ev.id).toBe('evt_1')
    expect(ev.type).toBe('invoice.paid')
    expect(ev.createdAt).toEqual(new Date(1756684800 * 1000))
  })
})

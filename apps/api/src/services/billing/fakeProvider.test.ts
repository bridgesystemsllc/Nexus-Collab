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
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'seat-8', prorationDate: 1735689600,
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
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'up', prorationDate: 1735689600,
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
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'down', prorationDate: 1735689600,
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
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'prev', prorationDate: 1735689600,
    })
    expect(preview.immediateChargeCents).toBe(0)
    expect(preview.effectiveImmediately).toBe(false)
  })

  it('returns a positive immediate charge for an upgrade', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const preview = await p.previewChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'prev', prorationDate: 1735689600,
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
        plan: planFor({ kind: 'seats', from: 8, to: q }), idempotencyKey: `p${q}`, prorationDate: 1735689600,
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

describe('createFakeProvider — cancelAtPeriodEnd', () => {
  it('sets cancelAtPeriodEnd and stamps canceledAt with the injected clock', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const updated = await p.cancelAtPeriodEnd(sub.id, 'cancel-1')
    expect(updated.cancelAtPeriodEnd).toBe(true)
    expect(updated.canceledAt).toEqual(NOW)
  })

  it('is idempotent on a repeated key', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const first = await p.cancelAtPeriodEnd(sub.id, 'cancel-1')
    const second = await p.cancelAtPeriodEnd(sub.id, 'cancel-1')
    expect(second).toEqual(first)
  })
})

describe('createFakeProvider — reactivate', () => {
  it('clears cancelAtPeriodEnd and canceledAt', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    await p.cancelAtPeriodEnd(sub.id, 'cancel-1')
    const reactivated = await p.reactivate(sub.id, 'reactivate-1')
    expect(reactivated.cancelAtPeriodEnd).toBe(false)
    expect(reactivated.canceledAt).toBeNull()
  })

  it('cancel then reactivate before period end returns the subscription to its pre-cancel shape', async () => {
    // Provider-level half of a product rule: cancel then reactivate before
    // period end must cost nothing and lose nothing. Nothing else in the
    // subscription — quantity, priceId, period bounds, status — may drift
    // across the round trip.
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const original = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    await p.cancelAtPeriodEnd(original.id, 'cancel-1')
    const restored = await p.reactivate(original.id, 'reactivate-1')
    expect(restored).toEqual(original)
  })
})

describe('createFakeProvider — createSetupIntent', () => {
  it('derives the client secret deterministically from the customer id', async () => {
    const result = await p.createSetupIntent('cus_abc123')
    expect(result.clientSecret).toBe('seti_cus_abc123_secret_fake')
  })
})

describe('createFakeProvider — listPaymentMethods', () => {
  it('returns an empty array for an unknown customer rather than throwing or returning undefined', async () => {
    const result = await p.listPaymentMethods('cus_unknown')
    expect(result).toEqual([])
  })
})

describe('createFakeProvider — setDefaultPaymentMethod', () => {
  it('marks exactly one card default and unsets the others', async () => {
    p.state.paymentMethods['cus_1'] = [
      { id: 'pm_1', brand: 'visa', last4: '1111', expMonth: 1, expYear: 2030, isDefault: true },
      { id: 'pm_2', brand: 'mastercard', last4: '2222', expMonth: 2, expYear: 2030, isDefault: false },
      { id: 'pm_3', brand: 'amex', last4: '3333', expMonth: 3, expYear: 2030, isDefault: false },
    ]
    await p.setDefaultPaymentMethod('cus_1', 'pm_2')
    const cards = p.state.paymentMethods['cus_1']
    expect(cards.filter((c) => c.isDefault).map((c) => c.id)).toEqual(['pm_2'])
    expect(cards.find((c) => c.id === 'pm_1')!.isDefault).toBe(false)
    expect(cards.find((c) => c.id === 'pm_3')!.isDefault).toBe(false)
  })
})

describe('createFakeProvider — detachPaymentMethod', () => {
  it("removes the card from the customer's payment methods", async () => {
    p.state.paymentMethods['cus_1'] = [
      { id: 'pm_1', brand: 'visa', last4: '1111', expMonth: 1, expYear: 2030, isDefault: true },
      { id: 'pm_2', brand: 'mastercard', last4: '2222', expMonth: 2, expYear: 2030, isDefault: false },
    ]
    await p.detachPaymentMethod('pm_1')
    expect(p.state.paymentMethods['cus_1'].map((c) => c.id)).toEqual(['pm_2'])
  })

  it('is a no-op when the payment method id is unknown', async () => {
    p.state.paymentMethods['cus_1'] = [
      { id: 'pm_1', brand: 'visa', last4: '1111', expMonth: 1, expYear: 2030, isDefault: true },
    ]
    await p.detachPaymentMethod('pm_does_not_exist')
    expect(p.state.paymentMethods['cus_1'].map((c) => c.id)).toEqual(['pm_1'])
  })
})

describe('createFakeProvider — failNext applies to every async provider method', () => {
  // verifyWebhook is excluded on purpose: it is the one genuinely synchronous
  // method on the interface (see provider.ts), and failNext arms a failure
  // that only checkFailure() — called by the async methods — ever consumes.
  // There is nothing for it to honour.
  const methodCases: Array<{ name: string; call: (fp: FakeProvider) => Promise<unknown> }> = [
    { name: 'createSetupIntent', call: (fp) => fp.createSetupIntent('cus_x') },
    { name: 'listPaymentMethods', call: (fp) => fp.listPaymentMethods('cus_x') },
    { name: 'setDefaultPaymentMethod', call: (fp) => fp.setDefaultPaymentMethod('cus_x', 'pm_x') },
    { name: 'detachPaymentMethod', call: (fp) => fp.detachPaymentMethod('pm_x') },
    { name: 'cancelAtPeriodEnd', call: (fp) => fp.cancelAtPeriodEnd('sub_x', 'key_x') },
    { name: 'reactivate', call: (fp) => fp.reactivate('sub_x', 'key_x') },
  ]

  for (const { name, call } of methodCases) {
    it(`${name} rejects with BillingProviderError when a failure is armed`, async () => {
      p.failNext('boom', false)
      await expect(call(p)).rejects.toThrow(BillingProviderError)
    })
  }
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

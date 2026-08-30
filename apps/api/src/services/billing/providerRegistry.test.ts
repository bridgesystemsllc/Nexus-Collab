// apps/api/src/services/billing/providerRegistry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBillingProvider, resetProviderForTests } from './providerRegistry'
import { BillingUnconfiguredError } from './provider'
import { planFor } from './proration'

// This install has no Stripe key yet, so the unconfigured path is the one that
// actually runs today. It must fail closed and say why — not return a broken
// object that fails somewhere less obvious.

const saved = { ...process.env }
beforeEach(() => { resetProviderForTests() })
afterEach(() => { process.env = { ...saved }; resetProviderForTests() })

describe('getBillingProvider — unconfigured', () => {
  it('every method rejects with BillingUnconfiguredError when no key is set', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const p = getBillingProvider()
    await expect(p.ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' }))
      .rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listPaymentMethods('cus_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listInvoices('cus_1')).rejects.toThrow(BillingUnconfiguredError)
  })

  it('throws rather than returning undefined for the synchronous method', () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(() => getBillingProvider().verifyWebhook(Buffer.from('{}'), 'sig'))
      .toThrow(BillingUnconfiguredError)
  })

  it('does not throw at construction — only on use', () => {
    // Booting an install without billing configured must not crash the API.
    delete process.env.STRIPE_SECRET_KEY
    expect(() => getBillingProvider()).not.toThrow()
  })
})

// Guard against premature wiring: STRIPE_SECRET_KEY being set must NOT make
// getBillingProvider() hand back a working Stripe provider — that
// implementation does not exist yet (it arrives in PR B5). This block pins
// today's deliberate behaviour (the set-key branch still returns the
// unconfigured provider) so that when B5 replaces that line with a real
// createStripeProvider(), the suite goes red on purpose and whoever makes
// the change updates this test knowingly, instead of either accidentally
// leaving the fallback in place or being surprised by a failing suite.
describe('getBillingProvider — STRIPE_SECRET_KEY set, still unconfigured (guard against premature wiring)', () => {
  it('every async method still rejects with BillingUnconfiguredError when STRIPE_SECRET_KEY is set', async () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    const p = getBillingProvider()

    await expect(p.ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' }))
      .rejects.toThrow(BillingUnconfiguredError)
    await expect(p.createSetupIntent('cus_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listPaymentMethods('cus_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.setDefaultPaymentMethod('cus_1', 'pm_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.detachPaymentMethod('pm_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.createSubscription({ customerId: 'cus_1', priceId: 'price_1', quantity: 1, idempotencyKey: 'k' }))
      .rejects.toThrow(BillingUnconfiguredError)
    await expect(p.previewChange({
      subscriptionId: 'sub_1', itemId: 'si_1', priceId: 'price_1', quantity: 2,
      plan: planFor({ kind: 'seats', from: 1, to: 2 }), idempotencyKey: 'k',
    })).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.applyChange({
      subscriptionId: 'sub_1', itemId: 'si_1', priceId: 'price_1', quantity: 2,
      plan: planFor({ kind: 'seats', from: 1, to: 2 }), idempotencyKey: 'k',
    })).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.cancelAtPeriodEnd('sub_1', 'k')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.reactivate('sub_1', 'k')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listInvoices('cus_1')).rejects.toThrow(BillingUnconfiguredError)
  })

  it('verifyWebhook still throws BillingUnconfiguredError when STRIPE_SECRET_KEY is set', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    expect(() => getBillingProvider().verifyWebhook(Buffer.from('{}'), 'sig'))
      .toThrow(BillingUnconfiguredError)
  })

  it('getBillingProvider() does not throw at construction when STRIPE_SECRET_KEY is set', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    expect(() => getBillingProvider()).not.toThrow()
  })
})

describe('getBillingProvider — fake', () => {
  it('returns the in-memory provider when BILLING_PROVIDER=fake', async () => {
    process.env.BILLING_PROVIDER = 'fake'
    const p = getBillingProvider()
    await expect(p.ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' }))
      .resolves.toHaveProperty('customerId')
  })

  it('memoises the instance so state persists across calls', async () => {
    process.env.BILLING_PROVIDER = 'fake'
    await getBillingProvider().ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' })
    const p2 = getBillingProvider() as ReturnType<typeof getBillingProvider> & { state?: unknown }
    expect(Object.keys((p2 as any).state.customers)).toHaveLength(1)
  })
})

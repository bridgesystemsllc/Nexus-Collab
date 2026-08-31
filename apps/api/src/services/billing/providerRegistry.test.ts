// apps/api/src/services/billing/providerRegistry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBillingProvider, resetProviderForTests } from './providerRegistry'
import { BillingProviderError, BillingUnconfiguredError } from './provider'
import { resetStripeClientForTests } from './stripeClient'

// This install has no Stripe key yet, so the unconfigured path is the one that
// actually runs today. It must fail closed and say why — not return a broken
// object that fails somewhere less obvious.

const saved = { ...process.env }
beforeEach(() => { resetProviderForTests(); resetStripeClientForTests() })
afterEach(() => { process.env = { ...saved }; resetProviderForTests(); resetStripeClientForTests() })

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

// Formerly "guard against premature wiring": until PR B5, STRIPE_SECRET_KEY
// being set deliberately still returned the unconfigured provider, because
// the Stripe implementation didn't exist yet — and this block pinned that so
// the suite would go red the moment someone wired it up, forcing a knowing
// update rather than an accidental one. B5 IS that knowing update:
// `getBillingProvider()` now returns the real Stripe provider once a key is
// set. What this block asserts today is only that the routing works — it
// must never require a real key or reach the network, so every check below
// is either synchronous (construction, `verifyWebhook`'s local signature
// check) or a `mode` assertion, never an awaited Stripe API call.
describe('getBillingProvider — Stripe provider wired when STRIPE_SECRET_KEY is set (B5)', () => {
  it('does not throw at construction when STRIPE_SECRET_KEY is set', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    expect(() => getBillingProvider()).not.toThrow()
  })

  it('routes to the real Stripe provider, not the unconfigured stub, once a key is set', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_not_a_real_secret'
    const p = getBillingProvider()

    // `verifyWebhook` is synchronous and makes no network call — Stripe's
    // signature check is a local HMAC comparison against the webhook secret,
    // never a request to Stripe. That makes it the one method that can prove
    // which provider is wired up without a real key or a network call: the
    // unconfigured stub always throws `BillingUnconfiguredError` no matter
    // what secrets are set, while the Stripe provider gets far enough to
    // reject the (deliberately invalid) signature on its own terms.
    expect(() => p.verifyWebhook(Buffer.from('{}'), 'not-a-valid-signature'))
      .toThrow(BillingProviderError)
  })

  it('verifyWebhook still throws BillingUnconfiguredError when STRIPE_WEBHOOK_SECRET is unset', () => {
    delete process.env.BILLING_PROVIDER
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_not_a_real_key'
    delete process.env.STRIPE_WEBHOOK_SECRET
    const p = getBillingProvider()
    expect(() => p.verifyWebhook(Buffer.from('{}'), 'sig')).toThrow(BillingUnconfiguredError)
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

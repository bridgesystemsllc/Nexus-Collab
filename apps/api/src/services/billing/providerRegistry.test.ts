// apps/api/src/services/billing/providerRegistry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBillingProvider, resetProviderForTests } from './providerRegistry'
import { BillingUnconfiguredError } from './provider'

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

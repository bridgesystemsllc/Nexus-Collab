// apps/api/src/services/billing/providerRegistry.ts
import { BillingUnconfiguredError, type BillingProvider } from './provider'
import { createFakeProvider } from './fakeProvider'
import { createStripeProvider } from './stripeProvider'

// ─── Provider selection ──────────────────────────────────────
// One place decides which BillingProvider the app is running against, so no
// caller ever has to ask whether Stripe is configured.
//
//   BILLING_PROVIDER=fake  → the in-memory provider (tests, local demos)
//   STRIPE_SECRET_KEY set  → the Stripe provider
//   neither                → a provider whose every method throws
//                            BillingUnconfiguredError
//
// The third case is the one this install is in today, and it is why the
// unconfigured provider is a real object rather than a null: a route that calls
// it gets a typed, catchable error naming the actual problem, instead of a
// TypeError three frames away from the cause.

let cached: BillingProvider | null = null

/** Every method throws. Constructing it does not. */
function unconfiguredProvider(): BillingProvider {
  // Every method but verifyWebhook is async: it must REJECT, not throw
  // synchronously, or the throw happens while evaluating the caller's
  // argument to expect(...) and .rejects never sees it. verifyWebhook is the
  // one genuinely synchronous method, so it gets a plain throw.
  const fail = async (): Promise<never> => { throw new BillingUnconfiguredError() }
  const failSync = (): never => { throw new BillingUnconfiguredError() }
  return {
    ensureCustomer: fail, createSetupIntent: fail, listPaymentMethods: fail,
    setDefaultPaymentMethod: fail, detachPaymentMethod: fail,
    createSubscription: fail, previewChange: fail, applyChange: fail,
    cancelAtPeriodEnd: fail, reactivate: fail, listInvoices: fail,
    verifyWebhook: failSync,
  } as unknown as BillingProvider
}

export function getBillingProvider(): BillingProvider {
  if (cached) return cached

  if (process.env.BILLING_PROVIDER === 'fake') {
    cached = createFakeProvider()
    return cached
  }

  if (process.env.STRIPE_SECRET_KEY) {
    // The Stripe implementation lands here in PR B5 (this change). Before it
    // existed, a set key still fell through to `unconfiguredProvider()` on
    // purpose — a set key implying a working provider before one existed
    // would have been a worse lie than no key at all. `providerRegistry.test.ts`
    // pinned that placeholder behaviour precisely so this line couldn't be
    // swapped without the suite going red — see the guard test's comment.
    cached = createStripeProvider()
    return cached
  }

  cached = unconfiguredProvider()
  return cached
}

/** Test hook. Never call this from application code. */
export function resetProviderForTests(): void {
  cached = null
}

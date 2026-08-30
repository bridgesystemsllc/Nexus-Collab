// apps/api/src/services/billing/provider.ts
import type { BillingInterval, ChangePlan, PreviewResult, SubscriptionStatus } from '@nexus/shared'

// ─── The BillingProvider seam ────────────────────────────────
// Everything above this interface — routes, entitlement resolution, webhook
// processing — is written and tested against `BillingProvider`, never against
// Stripe directly. `fakeProvider` (Task 3) implements it in memory so the rest
// of the module is testable without a Stripe key, which this install does not
// have. `stripeProvider` (Phase 2's B5) implements the same interface against
// the real API. Nothing above the seam should be able to tell which one it's
// talking to.

export interface ProviderPaymentMethod {
  id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean
}

export interface ProviderSubscription {
  id: string; customerId: string; itemId: string | null
  status: SubscriptionStatus; interval: BillingInterval
  priceId: string; quantity: number
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean; trialEndsAt: Date | null; canceledAt: Date | null
  /// Stripe's own event/object timestamp, for the out-of-order guard.
  updatedAt: Date
}

export interface ProviderInvoice {
  id: string; number: string | null; status: string
  amountDueCents: number; amountPaidCents: number; currency: string
  periodStart: Date | null; periodEnd: Date | null
  hostedInvoiceUrl: string | null; invoicePdfUrl: string | null
  attemptCount: number; nextPaymentAttemptAt: Date | null
}

export interface ProviderEvent {
  id: string; type: string; createdAt: Date
  /// The raw Stripe object, stored verbatim in BillingEvent.payload.
  data: Record<string, unknown>
}

export interface ChangeInput {
  subscriptionId: string
  itemId: string
  priceId: string
  quantity: number
  plan: ChangePlan
  /// Required on every write. Stripe retries on its own and so do we; the same
  /// key with the same arguments must produce one effect, not one per attempt.
  /// Derive it from what the change IS (org + target state), never from a clock
  /// or a random — a retry has to compute the same key the first attempt did.
  idempotencyKey: string
}

export interface CreateSubscriptionInput {
  customerId: string; priceId: string; quantity: number
  trialDays?: number; idempotencyKey: string
}

export interface BillingProvider {
  ensureCustomer(i: { orgId: string; name: string; email: string; idempotencyKey: string }): Promise<{ customerId: string }>
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>
  listPaymentMethods(customerId: string): Promise<ProviderPaymentMethod[]>
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>
  detachPaymentMethod(paymentMethodId: string): Promise<void>
  createSubscription(i: CreateSubscriptionInput): Promise<ProviderSubscription>
  previewChange(i: ChangeInput): Promise<PreviewResult>
  applyChange(i: ChangeInput): Promise<ProviderSubscription>
  cancelAtPeriodEnd(subscriptionId: string, idempotencyKey: string): Promise<ProviderSubscription>
  reactivate(subscriptionId: string, idempotencyKey: string): Promise<ProviderSubscription>
  listInvoices(customerId: string, cursor?: string): Promise<{ items: ProviderInvoice[]; nextCursor: string | null }>
  verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent
}

/// Thrown when STRIPE_SECRET_KEY is absent.
///
/// Distinct from a provider failure on purpose: "billing is not configured on
/// this install" is an operator problem answered with 503, while "Stripe said
/// no" is a user-facing outcome. Collapsing them would tell a customer their
/// card was declined when in fact nobody set the key.
export class BillingUnconfiguredError extends Error {
  constructor(message = 'BILLING_UNCONFIGURED') {
    super(message)
    this.name = 'BillingUnconfiguredError'
  }
}

/// Any provider-side failure.
///
/// `retryable` is the field that matters: a network blip should be retried, a
/// declined card must not be. Callers branch on it rather than parsing messages.
export class BillingProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message)
    this.name = 'BillingProviderError'
  }
}

// apps/api/src/services/billing/fakeProvider.ts
import type { BillingInterval, PreviewResult, SubscriptionStatus } from '@nexus/shared'
import {
  BillingProviderError,
  type BillingProvider, type ChangeInput, type CreateSubscriptionInput,
  type ProviderEvent, type ProviderInvoice, type ProviderPaymentMethod, type ProviderSubscription,
} from './provider'

// ─── The fake provider ───────────────────────────────────────
// A real implementation of BillingProvider backed by memory, so everything
// above the seam can be tested without a Stripe key — which this install does
// not yet have.
//
// Deterministic by construction: the clock is injected and ids are sequential.
// No Date.now(), no Math.random() anywhere in this file. A fake that is
// occasionally non-reproducible turns every suite built on it into a flake.
//
// It is NOT a Stripe simulator. It models the contract our code depends on —
// idempotency, immediate-vs-deferred application, non-negative money — and
// nothing else. Where Stripe's real behaviour matters (proration arithmetic,
// tax), the test clock suite in phase 7 is the authority, not this.

const SEAT_PRICE_CENTS = 5_900   // matches the Growth tier; arbitrary but fixed
const DAYS_IN_PERIOD = 30

export interface FakeState {
  customers: Record<string, { orgId: string; name: string; email: string }>
  subscriptions: Record<string, ProviderSubscription>
  paymentMethods: Record<string, ProviderPaymentMethod[]>
  invoices: Record<string, ProviderInvoice[]>
  appliedChanges: ChangeInput[]
  scheduledChanges: ChangeInput[]
}

export interface FakeProvider extends BillingProvider {
  state: FakeState
  /// Make the next call throw. One-shot, so a test can prove the failure path
  /// without poisoning every subsequent call.
  failNext(code: string, retryable: boolean): void
}

export function createFakeProvider(opts: { now?: Date } = {}): FakeProvider {
  const now = opts.now ?? new Date('2026-01-01T00:00:00Z')
  let seq = 0
  const nextId = (prefix: string) => `${prefix}_fake_${++seq}`

  const state: FakeState = {
    customers: {}, subscriptions: {}, paymentMethods: {},
    invoices: {}, appliedChanges: [], scheduledChanges: [],
  }

  /// Idempotency ledger: key → the result the first call produced.
  const seen = new Map<string, unknown>()
  let pendingFailure: { code: string; retryable: boolean } | null = null

  function checkFailure(): void {
    if (!pendingFailure) return
    const { code, retryable } = pendingFailure
    pendingFailure = null
    throw new BillingProviderError(`fake provider failure: ${code}`, code, retryable)
  }

  /// Replays the first result for a repeated key rather than acting twice.
  function idempotent<T>(key: string, produce: () => T): T {
    if (seen.has(key)) return seen.get(key) as T
    const result = produce()
    seen.set(key, result)
    return result
  }

  const provider: FakeProvider = {
    state,
    failNext(code, retryable) { pendingFailure = { code, retryable } },

    async ensureCustomer({ orgId, name, email, idempotencyKey }) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const customerId = nextId('cus')
        state.customers[customerId] = { orgId, name, email }
        return { customerId }
      })
    },

    async createSetupIntent(customerId) {
      checkFailure()
      return { clientSecret: `seti_${customerId}_secret_fake` }
    },

    async listPaymentMethods(customerId) {
      checkFailure()
      return state.paymentMethods[customerId] ?? []
    },

    async setDefaultPaymentMethod(customerId, paymentMethodId) {
      checkFailure()
      const list = state.paymentMethods[customerId] ?? []
      state.paymentMethods[customerId] = list.map((pm) => ({ ...pm, isDefault: pm.id === paymentMethodId }))
    },

    async detachPaymentMethod(paymentMethodId) {
      checkFailure()
      for (const [cid, list] of Object.entries(state.paymentMethods)) {
        state.paymentMethods[cid] = list.filter((pm) => pm.id !== paymentMethodId)
      }
    },

    async createSubscription({ customerId, priceId, quantity, trialDays, idempotencyKey }: CreateSubscriptionInput) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const id = nextId('sub')
        const end = new Date(now.getTime() + DAYS_IN_PERIOD * 86_400_000)
        const sub: ProviderSubscription = {
          id, customerId, itemId: nextId('si'),
          status: (trialDays ? 'trialing' : 'active') as SubscriptionStatus,
          interval: 'monthly' as BillingInterval,
          priceId, quantity,
          currentPeriodStart: now, currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          trialEndsAt: trialDays ? new Date(now.getTime() + trialDays * 86_400_000) : null,
          canceledAt: null,
          updatedAt: now,
        }
        state.subscriptions[id] = sub
        return sub
      })
    },

    async previewChange(input) {
      checkFailure()
      const sub = state.subscriptions[input.subscriptionId]
      if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)

      // Half a period remaining, fixed — deterministic, and enough to make
      // "prorated is less than a full period" observable.
      const remainingFraction = 0.5
      const deltaSeats = Math.max(0, input.quantity - sub.quantity)
      const immediate = input.plan.chargeNow
        ? Math.round(deltaSeats * SEAT_PRICE_CENTS * remainingFraction)
        : 0
      const credit = 0   // the fake never issues credit; a deferred change simply costs nothing today

      return {
        immediateChargeCents: immediate,
        creditAppliedCents: credit,
        taxCents: 0,
        nextInvoiceCents: input.quantity * SEAT_PRICE_CENTS,
        nextInvoiceDate: (sub.currentPeriodEnd ?? now).toISOString(),
        proratedLineItems: immediate > 0
          ? [{
              description: `${deltaSeats} additional seat(s)`,
              amountCents: immediate,
              period: { start: now.toISOString(), end: (sub.currentPeriodEnd ?? now).toISOString() },
            }]
          : [],
        newRecurringTotalCents: input.quantity * SEAT_PRICE_CENTS,
        effectiveImmediately: input.plan.timing === 'immediate',
        currency: 'usd',
      } satisfies PreviewResult
    },

    async applyChange(input) {
      checkFailure()
      return idempotent(input.idempotencyKey, () => {
        const sub = state.subscriptions[input.subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)

        if (input.plan.timing === 'immediate') {
          const updated = { ...sub, priceId: input.priceId, quantity: input.quantity, updatedAt: now }
          state.subscriptions[sub.id] = updated
          state.appliedChanges.push(input)
          return updated
        }

        // Deferred: the subscription is unchanged today. This is what lets an
        // upstream test prove a scheduled downgrade keeps its current features.
        state.scheduledChanges.push(input)
        return sub
      })
    },

    async cancelAtPeriodEnd(subscriptionId, idempotencyKey) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const sub = state.subscriptions[subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)
        const updated = { ...sub, cancelAtPeriodEnd: true, canceledAt: now, updatedAt: now }
        state.subscriptions[subscriptionId] = updated
        return updated
      })
    },

    async reactivate(subscriptionId, idempotencyKey) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const sub = state.subscriptions[subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)
        const updated = { ...sub, cancelAtPeriodEnd: false, canceledAt: null, updatedAt: now }
        state.subscriptions[subscriptionId] = updated
        return updated
      })
    },

    async listInvoices(customerId) {
      checkFailure()
      return { items: state.invoices[customerId] ?? [], nextCursor: null }
    },

    verifyWebhook(rawBody, signature) {
      // The sentinel stands in for a real HMAC. Anything else is a rejection,
      // so a test can prove the unsigned path is refused without a secret.
      if (signature !== 'fake-valid-signature') {
        throw new BillingProviderError('invalid signature', 'signature_verification_failed', false)
      }
      const parsed = JSON.parse(rawBody.toString('utf8'))
      return {
        id: parsed.id,
        type: parsed.type,
        createdAt: new Date(parsed.created * 1000),
        data: parsed.data?.object ?? {},
      } satisfies ProviderEvent
    },
  }

  return provider
}

// apps/api/src/services/billing/stripeProvider.ts
import { getStripeClient } from './stripeClient'
import {
  toProviderSubscription, toProviderInvoice, toProviderPaymentMethod,
  toProviderEvent, toPreviewResult, prorationBehavior,
  type StripeEventShape,
} from './stripeMappers'
import {
  BillingProviderError, BillingUnconfiguredError,
  type BillingProvider, type ChangeInput, type CreateSubscriptionInput,
  type ProviderEvent, type ProviderInvoice, type ProviderPaymentMethod, type ProviderSubscription,
} from './provider'

// ─── The Stripe implementation of BillingProvider ────────────
// Thin by design: every method here is one (or two, for the deferred-change
// path) Stripe call plus a mapper. The money DECISIONS — is this an upgrade,
// does it prorate, does it charge now — were already made in proration.ts
// before a `ChangeInput` ever reaches this file; this file's only job is
// translating that decision into Stripe's vocabulary and Stripe's response
// back into ours.
//
// Every write below carries an idempotency key straight from the caller.
// Never `crypto.randomUUID()` or `Date.now()` here — a retry has to compute
// the exact same key the first attempt did, and only the caller (who knows
// what the change IS, not when it was attempted) can guarantee that.

/// Duck-typed rather than `instanceof Stripe.errors.StripeError`, because
/// checking that would require importing the Stripe SDK package's error
/// classes — and this file, like every file but `stripeClient.ts`, may not
/// reach into that package at all. Every Stripe SDK error carries `type` (the
/// error class name, e.g. `StripeCardError`) and often `code` (a finer-grained
/// reason, e.g. `card_declined` or `lock_timeout`), which is all the
/// information retryability needs.
interface StripeErrorLike {
  type?: string
  code?: string
  message?: string
}

function isStripeErrorLike(err: unknown): err is StripeErrorLike {
  return typeof err === 'object' && err !== null && 'type' in err
}

/// Network blips and Stripe-side contention should be retried; a declined
/// card or a bad request never should, because retrying it repeats the same
/// failure while looking, to Stripe, like a second attempt to charge someone.
function mapStripeError(err: unknown): BillingProviderError {
  if (!isStripeErrorLike(err)) {
    // Not a Stripe SDK error at all (e.g. a thrown string, a bug elsewhere).
    // Treat as non-retryable — retrying an error we don't understand risks
    // repeating whatever caused it.
    const message = err instanceof Error ? err.message : String(err)
    return new BillingProviderError(message, 'unknown_error', false)
  }

  const { type, code, message = 'Stripe request failed' } = err

  // `lock_timeout` is Stripe-side database contention — transient by
  // definition — regardless of which broader error type wraps it, so it is
  // checked before the type-based rule below.
  if (code === 'lock_timeout') return new BillingProviderError(message, code, true)

  const retryable =
    type === 'StripeConnectionError' || // network failure reaching Stripe
    type === 'StripeRateLimitError' || // too many requests, back off and retry
    type === 'StripeAPIError' // Stripe's own 5xx

  // `StripeCardError` (card_declined and friends) and `StripeInvalidRequestError`
  // (validation) both fall through to `retryable: false` here — retrying either
  // repeats the same customer-facing failure, not a transient one.
  return new BillingProviderError(message, code ?? type ?? 'unknown_error', retryable)
}

export function createStripeProvider(): BillingProvider {
  return {
    async ensureCustomer({ orgId, name, email, idempotencyKey }) {
      const stripe = getStripeClient()
      try {
        const customer = await stripe.customers.create(
          { name, email, metadata: { orgId } },
          { idempotencyKey },
        )
        return { customerId: customer.id }
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async createSetupIntent(customerId) {
      const stripe = getStripeClient()
      try {
        const intent = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session' })
        if (!intent.client_secret) {
          // Stripe only omits this when the caller used an ephemeral key /
          // Connect flow we don't use — surfaced as a provider error rather
          // than handing a route a `clientSecret: undefined` to forward to
          // the client SDK.
          throw new BillingProviderError('setup intent created without a client secret', 'missing_client_secret', false)
        }
        return { clientSecret: intent.client_secret }
      } catch (err) {
        if (err instanceof BillingProviderError) throw err
        throw mapStripeError(err)
      }
    },

    async listPaymentMethods(customerId): Promise<ProviderPaymentMethod[]> {
      const stripe = getStripeClient()
      try {
        const customer = await stripe.customers.retrieve(customerId)
        const defaultPaymentMethod =
          !customer.deleted && customer.invoice_settings?.default_payment_method
            ? customer.invoice_settings.default_payment_method
            : null
        const defaultId =
          typeof defaultPaymentMethod === 'string' ? defaultPaymentMethod : (defaultPaymentMethod?.id ?? null)

        const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' })
        return paymentMethods.data.map((pm) => toProviderPaymentMethod(pm, defaultId))
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async setDefaultPaymentMethod(customerId, paymentMethodId) {
      const stripe = getStripeClient()
      try {
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async detachPaymentMethod(paymentMethodId) {
      const stripe = getStripeClient()
      try {
        await stripe.paymentMethods.detach(paymentMethodId)
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async createSubscription(i: CreateSubscriptionInput): Promise<ProviderSubscription> {
      const stripe = getStripeClient()
      try {
        const sub = await stripe.subscriptions.create(
          {
            customer: i.customerId,
            items: [{ price: i.priceId, quantity: i.quantity }],
            trial_period_days: i.trialDays,
            // Every subscription this account creates is taxed automatically —
            // never left to a manually-configured tax rate that can drift out
            // of date with where the customer actually is.
            automatic_tax: { enabled: true },
          },
          { idempotencyKey: i.idempotencyKey },
        )
        return toProviderSubscription(sub, new Date())
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async previewChange(i: ChangeInput) {
      const stripe = getStripeClient()
      try {
        // Read-only: an invoice preview has no side effects to guard with an
        // idempotency key, so `i.idempotencyKey` (required on the shared
        // `ChangeInput` shape because `applyChange` needs it) is unused here.
        const preview = await stripe.invoices.createPreview({
          subscription: i.subscriptionId,
          subscription_details: {
            items: [{ id: i.itemId, price: i.priceId, quantity: i.quantity }],
            proration_behavior: prorationBehavior(i.plan),
          },
          automatic_tax: { enabled: true },
        })
        return toPreviewResult(preview, i.plan)
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async applyChange(i: ChangeInput): Promise<ProviderSubscription> {
      const stripe = getStripeClient()
      try {
        if (i.plan.timing === 'immediate') {
          const sub = await stripe.subscriptions.update(
            i.subscriptionId,
            {
              items: [{ id: i.itemId, price: i.priceId, quantity: i.quantity }],
              proration_behavior: prorationBehavior(i.plan),
              automatic_tax: { enabled: true },
            },
            { idempotencyKey: i.idempotencyKey },
          )
          return toProviderSubscription(sub, new Date())
        }

        // Deferred (`period_end`): the current subscription is left untouched
        // — mutating it now would defeat the whole point of deferring — and
        // the new state is scheduled via a Subscription Schedule instead, so
        // Stripe applies it automatically when the current phase ends, with
        // no proration and no charge today.
        const current = await stripe.subscriptions.retrieve(i.subscriptionId)

        const schedule = current.schedule
          ? await stripe.subscriptionSchedules.retrieve(
              typeof current.schedule === 'string' ? current.schedule : current.schedule.id,
            )
          : await stripe.subscriptionSchedules.create(
              { from_subscription: i.subscriptionId },
              { idempotencyKey: i.idempotencyKey },
            )

        const currentPhase = schedule.phases[0]
        await stripe.subscriptionSchedules.update(
          schedule.id,
          {
            end_behavior: 'release',
            default_settings: { automatic_tax: { enabled: true } },
            phases: [
              {
                start_date: currentPhase.start_date,
                end_date: currentPhase.end_date,
                items: currentPhase.items.map((item) => ({
                  price: typeof item.price === 'string' ? item.price : item.price.id,
                  quantity: item.quantity ?? undefined,
                })),
                automatic_tax: { enabled: true },
              },
              {
                items: [{ price: i.priceId, quantity: i.quantity }],
                automatic_tax: { enabled: true },
              },
            ],
          },
          // Deterministic, not derived from a clock: a retry of the exact
          // same deferred change must reuse this exact key, so it is derived
          // from the caller's idempotency key rather than generated here.
          { idempotencyKey: `${i.idempotencyKey}:schedule` },
        )

        // The subscription itself hasn't changed yet — that's the point of
        // `period_end` — so the caller gets back today's unchanged state.
        return toProviderSubscription(current, new Date())
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async cancelAtPeriodEnd(subscriptionId, idempotencyKey) {
      const stripe = getStripeClient()
      try {
        const sub = await stripe.subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey },
        )
        return toProviderSubscription(sub, new Date())
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async reactivate(subscriptionId, idempotencyKey) {
      const stripe = getStripeClient()
      try {
        const sub = await stripe.subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: false },
          { idempotencyKey },
        )
        return toProviderSubscription(sub, new Date())
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    async listInvoices(customerId, cursor?): Promise<{ items: ProviderInvoice[]; nextCursor: string | null }> {
      const stripe = getStripeClient()
      try {
        const page = await stripe.invoices.list({
          customer: customerId,
          limit: 20,
          ...(cursor ? { starting_after: cursor } : {}),
        })
        const items = page.data.map(toProviderInvoice)
        const nextCursor = page.has_more && items.length > 0 ? page.data[page.data.length - 1].id : null
        return { items, nextCursor }
      } catch (err) {
        throw mapStripeError(err)
      }
    },

    verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent {
      const stripe = getStripeClient()
      const secret = process.env.STRIPE_WEBHOOK_SECRET
      if (!secret) throw new BillingUnconfiguredError()
      try {
        const event = stripe.webhooks.constructEvent(rawBody, signature, secret)
        return toProviderEvent(event as unknown as StripeEventShape)
      } catch (err) {
        throw mapStripeError(err)
      }
    },
  }
}

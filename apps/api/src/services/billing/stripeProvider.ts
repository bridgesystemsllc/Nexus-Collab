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
export function mapStripeError(err: unknown): BillingProviderError {
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

  // Every subscription/change/preview call sets `automatic_tax: { enabled:
  // true } }`; Stripe refuses that outright when it cannot resolve a tax
  // location for the customer. Given its own code and a message that names
  // the actual fix (rather than passed through generically), so a route
  // never has to guess whether this was a card decline — both would
  // otherwise report retryable: false from the generic path below and be
  // indistinguishable at that layer.
  if (code === 'customer_tax_location_invalid') {
    return new BillingProviderError(
      'Stripe could not determine a tax location for this customer. automatic_tax requires a customer ' +
        'address (at minimum country + postal code) — pass one via ensureCustomer before creating or ' +
        'changing a subscription.',
      'customer_tax_location_invalid',
      false,
    )
  }

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
    async ensureCustomer({ orgId, name, email, idempotencyKey, address }) {
      const stripe = getStripeClient()
      try {
        const customer = await stripe.customers.create(
          {
            name, email, metadata: { orgId },
            // Without an address, automatic_tax (on by default for every
            // subscription/change/preview) has no location to compute tax
            // against and Stripe refuses the request — see the
            // customer_tax_location_invalid branch in mapStripeError.
            ...(address
              ? {
                  address: {
                    line1: address.line1, line2: address.line2, city: address.city,
                    state: address.state, postal_code: address.postalCode, country: address.country,
                  },
                }
              : {}),
          },
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
        //
        // `proration_date` IS used, and matters: per Stripe's own docs on
        // this endpoint, prorations are only calculated exactly the same on
        // the real update if the real update passes the same
        // `subscription_details.proration_date` used to preview it. Passing
        // `i.prorationDate` here — the same value the caller will pass to
        // `applyChange` — is what makes the previewed number and the charged
        // number the same number.
        const preview = await stripe.invoices.createPreview({
          subscription: i.subscriptionId,
          subscription_details: {
            items: [{ id: i.itemId, price: i.priceId, quantity: i.quantity }],
            proration_behavior: prorationBehavior(i.plan),
            proration_date: i.prorationDate,
          },
          automatic_tax: { enabled: true },
        })
        return toPreviewResult(preview, i.plan, i.prorationDate)
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
              // The same instant `previewChange` computed the customer's
              // number against — passing it here is what Stripe's own docs
              // say is required for the charged amount to match the
              // previewed one exactly, rather than re-prorating against
              // "now" (which has moved on, however slightly, since preview).
              proration_date: i.prorationDate,
              automatic_tax: { enabled: true },
              // subscriptions.update defaults to payment_behavior:
              // 'allow_incomplete' — with always_invoice and a declined
              // card, the item swap COMMITS anyway and the subscription
              // lands in past_due, which resolve.ts grants full access to
              // for the entire grace window. error_if_incomplete makes
              // Stripe fail the whole update instead of landing a paid-for
              // tier on an invoice nobody paid. Only forced when this change
              // actually charges — a non-charging immediate change (the
              // unchanged-tier/seats/interval no-op) has nothing to fail on.
              ...(i.plan.chargeNow ? { payment_behavior: 'error_if_incomplete' as const } : {}),
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

        // Located via Stripe's own `current_phase` pointer, never
        // `phases[0]`: once a schedule has advanced past its first phase,
        // `phases[0]` is a COMPLETED phase. Writing [<completed>, <new>]
        // below would discard whatever is actually live right now and
        // back-date the new phase to start from a phase that already ended.
        // `current_phase` is only null for a schedule that hasn't started
        // yet, which `from_subscription` never produces — phases[0] is the
        // reasonable fallback for that edge rather than throwing.
        const currentPhaseMeta = schedule.current_phase
        const currentPhaseIndex = currentPhaseMeta
          ? schedule.phases.findIndex((p) => p.start_date === currentPhaseMeta.start_date)
          : 0
        const currentPhase = schedule.phases[currentPhaseIndex === -1 ? 0 : currentPhaseIndex]

        // Reuses existing discounts/coupons by id rather than re-describing
        // them — Stripe's own recommendation for carrying a discount forward
        // unchanged.
        const currentPhaseDiscounts = currentPhase.discounts
          .map((d) => {
            const discountId = typeof d.discount === 'string' ? d.discount : d.discount?.id
            const couponId = typeof d.coupon === 'string' ? d.coupon : d.coupon?.id
            return discountId ? { discount: discountId } : couponId ? { coupon: couponId } : undefined
          })
          .filter((d): d is NonNullable<typeof d> => d !== undefined)

        await stripe.subscriptionSchedules.update(
          schedule.id,
          {
            end_behavior: 'release',
            // Reuses the same decision proration.ts already made — a
            // period_end plan always resolves to 'none' here — rather than
            // hardcoding it a second time. This top-level field's documented
            // default is create_prorations; omitting it is exactly how C1
            // happened: Stripe prorated the still-billing current phase the
            // instant it saw ANY change to the schedule, even though the
            // change was meant to apply only at period end.
            proration_behavior: prorationBehavior(i.plan),
            default_settings: { automatic_tax: { enabled: true } },
            phases: [
              {
                // The CURRENT phase, carried forward field-for-field. A
                // `phases` update replaces the WHOLE array — any field of
                // the live phase this object doesn't set is DROPPED from
                // it, and Stripe reads that as a real billing change to a
                // phase still being invoiced, prorating it immediately. This
                // covers the fields a subscription on this account actually
                // sets (items, discounts, trial, collection method, default
                // payment method, billing cycle anchor); a schedule using
                // Connect transfer/application-fee data, manual
                // add_invoice_items, or per-phase metadata needs a wider
                // copy than this gives it.
                start_date: currentPhase.start_date,
                end_date: currentPhase.end_date,
                items: currentPhase.items.map((item) => ({
                  price: typeof item.price === 'string' ? item.price : item.price.id,
                  quantity: item.quantity ?? undefined,
                })),
                discounts: currentPhaseDiscounts,
                trial_end: currentPhase.trial_end ?? undefined,
                collection_method: currentPhase.collection_method ?? undefined,
                default_payment_method:
                  typeof currentPhase.default_payment_method === 'string'
                    ? currentPhase.default_payment_method
                    : (currentPhase.default_payment_method?.id ?? undefined),
                billing_cycle_anchor: currentPhase.billing_cycle_anchor ?? undefined,
                automatic_tax: { enabled: true },
              },
              {
                // The new, trailing phase. No start_date of its own: Stripe
                // chains it immediately after the current phase above ends.
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

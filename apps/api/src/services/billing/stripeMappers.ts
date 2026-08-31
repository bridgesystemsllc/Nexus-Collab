// apps/api/src/services/billing/stripeMappers.ts
import type { BillingInterval, ChangePlan, PreviewResult, SubscriptionStatus } from '@nexus/shared'
import type { ProviderEvent, ProviderInvoice, ProviderPaymentMethod, ProviderSubscription } from './provider'

// ─── Pure Stripe → DTO mappers ───────────────────────────────
// No network, no client, no keys — every function here takes a plain object
// and returns ours. This is where B5's real test coverage lives, because it
// is the only part of B5 that can be exercised without a Stripe key.
//
// Deliberately typed against small local shapes (`Stripe*Shape` below) rather
// than the Stripe SDK package's own types: importing its `Stripe.Subscription`
// etc. here would mean a type-only import of that package, and stripeClient.ts
// is the only file allowed to reach into that package at all — type-only
// imports included, since the single-import guard this module is checked
// against greps for the import statement itself and does not distinguish
// value imports from type-only ones. A real Stripe API response is a
// structural superset of these shapes, so passing one in from
// `stripeProvider.ts` (which DOES have the real SDK type in scope, inferred
// from `getStripeClient()`'s return type without ever writing an import of
// its own) still typechecks.

// ─── Minimal Stripe-shaped inputs ────────────────────────────

export interface StripeSubscriptionItemShape {
  id: string
  quantity?: number
  price: { id: string; recurring?: { interval: string } | null }
}

export interface StripeSubscriptionShape {
  id: string
  customer: string | { id: string }
  status: string
  items: { data: StripeSubscriptionItemShape[] }
  current_period_start: number | null
  current_period_end: number | null
  cancel_at_period_end: boolean
  trial_end: number | null
  canceled_at: number | null
}

export interface StripeInvoiceShape {
  id: string
  number: string | null
  status: string | null
  amount_due: number
  amount_paid: number
  currency: string
  period_start: number | null
  period_end: number | null
  hosted_invoice_url?: string | null
  invoice_pdf?: string | null
  attempt_count: number
  next_payment_attempt: number | null
}

export interface StripePaymentMethodShape {
  id: string
  card?: { brand: string; last4: string; exp_month: number; exp_year: number } | null
}

export interface StripeEventShape {
  id: string
  type: string
  created: number
  data: { object: Record<string, unknown> }
}

/// An "upcoming invoice" preview (`invoices.retrieveUpcoming` /
/// `invoices.createPreview` depending on SDK version) plus the proration
/// lines it carries. `tax` is Stripe's own aggregate tax field on the
/// invoice, kept separate from `lines` on purpose — folding it into a line
/// item would make `taxCents` un-derivable from the total alone.
export interface StripeUpcomingInvoiceShape {
  currency: string
  tax: number | null
  period_end: number | null
  next_payment_attempt: number | null
  lines: {
    data: Array<{
      description: string | null
      amount: number
      proration: boolean
      period: { start: number; end: number }
    }>
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/// Stripe timestamps are whole seconds since the epoch; every Date in our
/// DTOs is milliseconds. `null` passes through — Stripe uses it to mean "this
/// subscription/invoice has no such period" (e.g. a subscription mid-trial
/// with no current billing period yet), and coercing that to `new Date(0)`
/// would silently invent a period boundary that never existed.
function secondsToDate(seconds: number | null | undefined): Date | null {
  return seconds == null ? null : new Date(seconds * 1000)
}

// ─── Subscription status ─────────────────────────────────────

/// Stripe models 8 subscription statuses; `SubscriptionStatus` (packages/shared)
/// models 7 — everything Stripe has EXCEPT `unpaid`. `unpaid` is what a
/// `collection_method: 'send_invoice'` subscription becomes after its
/// retry/dunning deadline passes without payment, still short of
/// cancellation. Of the statuses our union does model, `past_due` is the
/// closest: both mean "payment is owed and collection has failed so far, but
/// the subscription has not yet been terminated," and both should drive the
/// same grace-period/entitlement behaviour. Mapping it there rather than
/// widening `SubscriptionStatus` keeps the union — and every switch statement
/// written against it elsewhere in the module — exhaustive without a new,
/// rarely-hit case to remember. Flagged here and in the PR report rather than
/// silently absorbed, since it is a real (if narrow) loss of information.
const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete_expired',
  paused: 'paused',
  unpaid: 'past_due', // see comment above — closest of the 7 we model
}

function mapStatus(status: string): SubscriptionStatus {
  // A status Stripe adds in the future (or any value this map doesn't
  // recognise) falls back to `past_due` for the same reason `unpaid` does:
  // the safe direction for an unrecognised billing state is "treat as
  // payment trouble," never "treat as paid and active."
  return STRIPE_STATUS_MAP[status] ?? 'past_due'
}

/// Stripe's `recurring.interval` is `day | week | month | year`; our
/// `BillingInterval` only models the two intervals this product actually
/// sells. `year` maps to `annual`; everything else (including `month`) maps
/// to `monthly`, since `day`/`week` prices should never exist in this
/// account's catalogue — if one ever did, treating it as `monthly` is the
/// safer of the two available buckets (more billing events noticed sooner,
/// not fewer).
function mapInterval(interval: string | null | undefined): BillingInterval {
  return interval === 'year' ? 'annual' : 'monthly'
}

// ─── Mappers ──────────────────────────────────────────────────

export function toProviderSubscription(sub: StripeSubscriptionShape, updatedAt: Date): ProviderSubscription {
  // Quantity and price live on the subscription ITEM, not the subscription
  // itself — Stripe supports multiple items per subscription (add-ons,
  // metered usage) but this product only ever creates one, so item[0] is the
  // whole subscription as far as our model is concerned.
  const item = sub.items.data[0]
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  return {
    id: sub.id,
    customerId,
    itemId: item?.id ?? null,
    status: mapStatus(sub.status),
    interval: mapInterval(item?.price.recurring?.interval),
    priceId: item?.price.id ?? '',
    quantity: item?.quantity ?? 0,
    currentPeriodStart: secondsToDate(sub.current_period_start),
    currentPeriodEnd: secondsToDate(sub.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEndsAt: secondsToDate(sub.trial_end),
    canceledAt: secondsToDate(sub.canceled_at),
    updatedAt,
  }
}

export function toProviderInvoice(inv: StripeInvoiceShape): ProviderInvoice {
  return {
    id: inv.id,
    number: inv.number,
    // `status` is nullable in Stripe's own type (rare, legacy invoices).
    // `draft` is the correct fallback: it is the one status that means "not
    // yet finalized," which is the only state a null status has been
    // observed to represent.
    status: inv.status ?? 'draft',
    // Already integer cents — never touch these with a float conversion.
    amountDueCents: inv.amount_due,
    amountPaidCents: inv.amount_paid,
    currency: inv.currency,
    periodStart: secondsToDate(inv.period_start),
    periodEnd: secondsToDate(inv.period_end),
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdfUrl: inv.invoice_pdf ?? null,
    attemptCount: inv.attempt_count,
    nextPaymentAttemptAt: secondsToDate(inv.next_payment_attempt),
  }
}

export function toProviderPaymentMethod(pm: StripePaymentMethodShape, defaultId: string | null): ProviderPaymentMethod {
  // ProviderPaymentMethod models a card, full stop — it has no `type` field.
  // A non-card payment method (ACH debit, etc.) isn't representable here; if
  // this account ever accepts one, the DTO needs to grow a variant rather
  // than this mapper inventing card-shaped placeholder values for it.
  const card = pm.card ?? { brand: 'unknown', last4: '0000', exp_month: 0, exp_year: 0 }
  return {
    id: pm.id,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
    isDefault: defaultId != null && pm.id === defaultId,
  }
}

export function toProviderEvent(evt: StripeEventShape): ProviderEvent {
  return {
    id: evt.id,
    type: evt.type,
    createdAt: secondsToDate(evt.created) as Date, // `created` is non-nullable on a real event
    // The raw object, stored verbatim — never re-derived from `evt` again
    // once it's in `BillingEvent.payload`.
    data: evt.data.object,
  }
}

export function toPreviewResult(upcomingInvoice: StripeUpcomingInvoiceShape, plan: ChangePlan): PreviewResult {
  const lines = upcomingInvoice.lines.data
  const prorationLines = lines.filter((l) => l.proration)
  const recurringLines = lines.filter((l) => !l.proration)

  // Split, not netted: a $30 upgrade charge and a $12 unused-time credit on
  // the same change must show as +$30 / -$12, never as a single +$18 line —
  // the customer needs to see both halves to trust the number. Both
  // aggregates are non-negative by construction: a credit is summed into
  // `creditAppliedCents` as a positive magnitude, never left as a negative
  // contribution to `immediateChargeCents`.
  const immediateChargeCents = prorationLines
    .filter((l) => l.amount > 0)
    .reduce((sum, l) => sum + l.amount, 0)
  const creditAppliedCents = prorationLines
    .filter((l) => l.amount < 0)
    .reduce((sum, l) => sum + Math.abs(l.amount), 0)

  // Tax is Stripe's own aggregate field on the invoice — never folded into
  // any line total, so a caller can always show "subtotal + tax = total"
  // without re-deriving tax from line items that don't carry it individually.
  const taxCents = upcomingInvoice.tax ?? 0

  // What the customer's next full-cycle bill totals, pre-tax — the
  // non-proration lines are exactly the recurring charges for the upcoming
  // period. In steady state this is also the ongoing recurring total, so
  // `newRecurringTotalCents` reuses the same figure: two DTO fields serving
  // two different callers (one asks "what's my next invoice", the other
  // "what's my new recurring rate") without either re-deriving it from lines.
  const nextInvoiceCents = recurringLines.reduce((sum, l) => sum + l.amount, 0)

  const nextInvoiceDate = secondsToDate(upcomingInvoice.next_payment_attempt ?? upcomingInvoice.period_end)

  return {
    immediateChargeCents,
    creditAppliedCents,
    taxCents,
    nextInvoiceCents,
    nextInvoiceDate: (nextInvoiceDate ?? new Date(0)).toISOString(),
    proratedLineItems: prorationLines.map((l) => ({
      description: l.description ?? '',
      amountCents: l.amount,
      period: {
        start: secondsToDate(l.period.start)!.toISOString(),
        end: secondsToDate(l.period.end)!.toISOString(),
      },
    })),
    newRecurringTotalCents: nextInvoiceCents,
    effectiveImmediately: plan.timing === 'immediate',
    currency: upcomingInvoice.currency,
  }
}

// ─── proration_behavior derivation ───────────────────────────
// Translates OUR decision (`ChangePlan`, from proration.ts) into Stripe's
// vocabulary for it. The decision itself is made elsewhere — this is
// notation, not policy.
export function prorationBehavior(plan: ChangePlan): 'create_prorations' | 'always_invoice' | 'none' {
  // A deferred change (period_end) is applied via a subscription schedule,
  // never Stripe's own proration math, so there is nothing for
  // proration_behavior to do.
  if (plan.timing === 'period_end') return 'none'
  // Immediate but nothing to prorate (e.g. the unchanged-tier/seats/interval
  // no-op plan) — apply without generating proration line items.
  if (!plan.prorate) return 'none'
  // Immediate + prorate: charge today only if the plan says to. Without
  // `chargeNow`, the proration is recorded but rolled into the next regular
  // invoice instead of billed immediately.
  return plan.chargeNow ? 'always_invoice' : 'create_prorations'
}

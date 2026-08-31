// apps/api/src/services/billing/webhookHandlers.ts
import type { Tx } from '../users/auditService'
import { diff } from '../users/auditService'
import type { HandlerContext, LinkedSubscription } from './webhookProcessor'
import type { ProviderEvent } from './provider'
import {
  toProviderSubscription, toProviderInvoice, toProviderPaymentMethod,
  type StripeSubscriptionShape, type StripeInvoiceShape, type StripePaymentMethodShape,
} from './stripeMappers'
import { findTierByPriceId } from './catalogue'
import { appendWebhookAudit, type BillingAuditAction } from './billingAudit'

// ─── Webhook event handlers ───────────────────────────────────
// One function per Stripe event type webhookProcessor.ts dispatches to.
// Every handler here runs INSIDE the transaction processEvent opens: a throw
// rolls back everything it did this attempt and is recorded as
// `processingError` so the event retries. Nothing here calls
// `invalidateEntitlements` — processEvent does that once, after commit (see
// its own doc comment for why doing it inside the transaction is wrong).
//
// Every handler reads Stripe fields only through stripeMappers.ts. None of
// them import `stripe` or reach into `event.data` for anything beyond the
// cast to a Stripe*Shape immediately below — stripeClient.ts stays the only
// file with the real SDK in scope.

/// 14 days, not the 7 named in docs/superpowers/plans/2026-08-25-billing-00-master.md
/// (and, until this PR, the stale comment in resolve.ts). The newer
/// subscriptions brief supersedes the master plan on this number — 14 is the
/// one actually enacted here. If a future reader finds "7 days" anywhere
/// else in this codebase, that reference is the one that's wrong, not this.
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Every handler needs an orgId and the subscription row it resolves through.
 * `ctx.subscription` is null when the event's Stripe customer id matches no
 * BillingSubscription — Stripe knows about a customer we don't. That is not
 * a gap to tolerate: throwing here is what makes processEvent return
 * `failed` (Stripe retries, and the event is visible in BillingEvent) rather
 * than silently discarding what could be a real money event.
 */
function requireContext(ctx: HandlerContext): { orgId: string; subscription: LinkedSubscription } {
  if (!ctx.subscription || !ctx.orgId) {
    throw new Error('billing webhook: no BillingSubscription matches this Stripe customer')
  }
  return { orgId: ctx.orgId, subscription: ctx.subscription }
}

// ─── customer.subscription.created / .updated ────────────────
// The workhorse. Both events converge on the same sync: map the Stripe
// object, resolve its price to a BillingTier, apply a pending downgrade if
// the period has rolled past its effective date, and write the row.

async function syncSubscription(
  tx: Tx, event: ProviderEvent, ctx: HandlerContext, action: BillingAuditAction,
): Promise<void> {
  const { orgId, subscription } = requireContext(ctx)
  const mapped = toProviderSubscription(event.data as unknown as StripeSubscriptionShape, event.createdAt)

  const tier = await findTierByPriceId(tx, mapped.priceId)
  if (!tier) {
    // An unrecognised price id must not silently pick a tier — a wrong tier
    // is a wrong entitlement. Throwing lands as `processingError` (the event
    // retries and is visible) rather than guessing.
    throw new Error(`billing webhook: no BillingTier matches Stripe price "${mapped.priceId || '(none)'}"`)
  }

  // The ordering guard's projection (LinkedSubscription) doesn't carry the
  // pending-change fields — read the full row for those.
  const current = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscription.id } })

  let tierId = tier.id
  let seatsPurchased = mapped.quantity
  let pendingTierId: string | null = current.pendingTierId
  let pendingSeats: number | null = current.pendingSeats
  let pendingChangeEffectiveAt: Date | null = current.pendingChangeEffectiveAt

  // A scheduled downgrade doesn't land the moment it's scheduled — it lands
  // here, the first time an event arrives whose new period has actually
  // started on or after pendingChangeEffectiveAt. Once it has, the pending
  // target becomes the real one and the pending markers are cleared, so the
  // UI stops showing a change that already happened.
  if (
    current.pendingChangeEffectiveAt
    && mapped.currentPeriodStart
    && mapped.currentPeriodStart >= current.pendingChangeEffectiveAt
  ) {
    if (current.pendingTierId) tierId = current.pendingTierId
    if (current.pendingSeats != null) seatsPurchased = current.pendingSeats
    pendingTierId = null
    pendingSeats = null
    pendingChangeEffectiveAt = null
  }

  const before = {
    tierId: current.tierId, status: current.status, billingInterval: current.billingInterval,
    seatsPurchased: current.seatsPurchased,
    stripeSubscriptionId: current.stripeSubscriptionId, stripeSubscriptionItemId: current.stripeSubscriptionItemId,
    currentPeriodStart: current.currentPeriodStart, currentPeriodEnd: current.currentPeriodEnd,
    cancelAtPeriodEnd: current.cancelAtPeriodEnd, trialEndsAt: current.trialEndsAt, canceledAt: current.canceledAt,
    pendingTierId: current.pendingTierId, pendingSeats: current.pendingSeats,
    pendingChangeEffectiveAt: current.pendingChangeEffectiveAt,
  }
  const after = {
    tierId, status: mapped.status, billingInterval: mapped.interval, seatsPurchased,
    stripeSubscriptionId: mapped.id, stripeSubscriptionItemId: mapped.itemId,
    currentPeriodStart: mapped.currentPeriodStart, currentPeriodEnd: mapped.currentPeriodEnd,
    cancelAtPeriodEnd: mapped.cancelAtPeriodEnd, trialEndsAt: mapped.trialEndsAt, canceledAt: mapped.canceledAt,
    pendingTierId, pendingSeats, pendingChangeEffectiveAt,
  }

  await tx.billingSubscription.update({
    where: { id: subscription.id },
    // lastStripeEventAt is the out-of-order guard's high-water mark — every
    // handler that writes BillingSubscription fields the guard protects must
    // advance it, or a later stale event could compare against a mark that
    // never moved.
    data: { ...after, lastStripeEventAt: event.createdAt },
  })

  await appendWebhookAudit({
    tx, orgId, action, entityType: 'subscription', entityId: subscription.id,
    stripeEventId: event.id, changes: diff(before, after),
  })
}

export async function handleSubscriptionCreated(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  await syncSubscription(tx, event, ctx, 'billing.subscription_created')
}

export async function handleSubscriptionUpdated(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  await syncSubscription(tx, event, ctx, 'billing.subscription_synced')
}

// ─── customer.subscription.deleted ────────────────────────────

export async function handleSubscriptionDeleted(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId, subscription } = requireContext(ctx)
  const mapped = toProviderSubscription(event.data as unknown as StripeSubscriptionShape, event.createdAt)

  const current = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscription.id } })
  const canceledAt = mapped.canceledAt ?? event.createdAt

  await tx.billingSubscription.update({
    where: { id: subscription.id },
    // currentPeriodEnd is deliberately untouched, and the row is never
    // deleted: resolve.ts grants full access through the period already
    // paid for, keyed off that exact field. Clearing it (or the row) would
    // cut off access a customer already paid for.
    data: { status: 'canceled', canceledAt, lastStripeEventAt: event.createdAt },
  })

  await appendWebhookAudit({
    tx, orgId, action: 'billing.subscription_canceled', entityType: 'subscription', entityId: subscription.id,
    stripeEventId: event.id,
    changes: diff(
      { status: current.status, canceledAt: current.canceledAt },
      { status: 'canceled', canceledAt },
    ),
  })
}

// ─── Shared invoice upsert (invoice.paid / invoice.payment_failed) ────

function invoiceRow(orgId: string, mapped: ReturnType<typeof toProviderInvoice>) {
  return {
    orgId, stripeInvoiceId: mapped.id, number: mapped.number, status: mapped.status,
    amountDueCents: mapped.amountDueCents, amountPaidCents: mapped.amountPaidCents, currency: mapped.currency,
    periodStart: mapped.periodStart, periodEnd: mapped.periodEnd,
    hostedInvoiceUrl: mapped.hostedInvoiceUrl, invoicePdfUrl: mapped.invoicePdfUrl,
    attemptCount: mapped.attemptCount, nextPaymentAttemptAt: mapped.nextPaymentAttemptAt,
  }
}

// ─── invoice.paid ──────────────────────────────────────────────

export async function handleInvoicePaid(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId, subscription } = requireContext(ctx)
  const mapped = toProviderInvoice(event.data as unknown as StripeInvoiceShape)
  const data = invoiceRow(orgId, mapped)

  const invoice = await tx.billingInvoice.upsert({
    where: { stripeInvoiceId: mapped.id }, create: data, update: data,
  })

  const current = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscription.id } })
  await tx.billingSubscription.update({
    where: { id: subscription.id },
    // A recovered payment must not leave a stale grace timestamp behind:
    // resolve.ts reports inGracePeriod from status AND this field together,
    // so an un-cleared value here is a dunning banner on a healthy account.
    //
    // lastStripeEventAt is deliberately NOT touched here. That mark belongs
    // to the subscription-ordering guard in webhookProcessor.ts, which only
    // `customer.subscription.*` handlers own (this event type is
    // `ordered: false` in that table) — an invoice event advancing a
    // subscription's ordering mark previously let a same-second
    // subscription.updated event with an earlier `createdAt` be discarded as
    // `stale`, freezing `currentPeriodEnd` at last period's value even
    // though the invoice for the NEW period had just been paid.
    data: { gracePeriodEndsAt: null },
  })

  await appendWebhookAudit({
    tx, orgId, action: 'billing.invoice_paid', entityType: 'invoice', entityId: invoice.id,
    stripeEventId: event.id,
    changes: diff({ gracePeriodEndsAt: current.gracePeriodEndsAt }, { gracePeriodEndsAt: null }),
  })
}

// ─── invoice.payment_failed ────────────────────────────────────

export async function handleInvoicePaymentFailed(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId, subscription } = requireContext(ctx)
  const mapped = toProviderInvoice(event.data as unknown as StripeInvoiceShape)
  const data = invoiceRow(orgId, mapped)

  const invoice = await tx.billingInvoice.upsert({
    where: { stripeInvoiceId: mapped.id }, create: data, update: data,
  })

  const current = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscription.id } })

  // Only stamp the window if one isn't already running. Stripe's dunning
  // retries the same invoice several times over the grace window; re-stamping
  // on every retry would push the deadline out indefinitely and a genuinely
  // delinquent account would never reach read-only. The first failure sets
  // it, every failure after that (until it clears — see invoice.paid) is a
  // no-op on this field.
  const gracePeriodEndsAt = current.gracePeriodEndsAt ?? new Date(event.createdAt.getTime() + GRACE_PERIOD_MS)

  await tx.billingSubscription.update({
    where: { id: subscription.id },
    // lastStripeEventAt untouched — see the identical note in
    // handleInvoicePaid above; the same reasoning applies here.
    data: { gracePeriodEndsAt },
  })

  await appendWebhookAudit({
    tx, orgId, action: 'billing.invoice_failed', entityType: 'invoice', entityId: invoice.id,
    stripeEventId: event.id,
    changes: diff({ gracePeriodEndsAt: current.gracePeriodEndsAt }, { gracePeriodEndsAt }),
  })
}

// ─── invoice.upcoming ──────────────────────────────────────────
// Informational only — Stripe is previewing what it's about to bill, nothing
// has happened yet. Recorded to the audit trail for visibility; deliberately
// does not touch BillingSubscription or upsert a BillingInvoice row (that
// table mirrors invoices that actually exist, not previews of ones that
// might).

export async function handleInvoiceUpcoming(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId } = requireContext(ctx)
  const mapped = toProviderInvoice(event.data as unknown as StripeInvoiceShape)

  // entityId is null — this is a preview, not a row in BillingInvoice (see
  // above), so there is no id of ours to point at.
  await appendWebhookAudit({
    tx, orgId, action: 'billing.invoice_upcoming', entityType: 'invoice', entityId: null,
    stripeEventId: event.id,
    changes: { nextInvoiceAmountDueCents: { from: null, to: mapped.amountDueCents } },
  })
}

// ─── payment_method.attached / .detached ──────────────────────

export async function handlePaymentMethodAttached(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId } = requireContext(ctx)
  // `defaultId` is unknowable from an attach event alone — Stripe reports the
  // default on the *customer* object, which this event doesn't carry. `null`
  // here just means "not asserting a default"; a genuine default change
  // arrives as its own signal (a future customer.updated handler) and
  // corrects isDefault then. It is never regressed to false for an existing
  // default by the `update` branch below, which omits the field entirely.
  const mapped = toProviderPaymentMethod(event.data as unknown as StripePaymentMethodShape, null)

  const pm = await tx.billingPaymentMethod.upsert({
    where: { stripePaymentMethodId: mapped.id },
    create: {
      orgId, stripePaymentMethodId: mapped.id, brand: mapped.brand, last4: mapped.last4,
      expMonth: mapped.expMonth, expYear: mapped.expYear, isDefault: mapped.isDefault,
    },
    update: { brand: mapped.brand, last4: mapped.last4, expMonth: mapped.expMonth, expYear: mapped.expYear },
  })

  await appendWebhookAudit({
    tx, orgId, action: 'billing.payment_method_added', entityType: 'payment_method', entityId: pm.id,
    stripeEventId: event.id,
    changes: diff({}, { brand: mapped.brand, last4: mapped.last4 }),
  })
}

export async function handlePaymentMethodDetached(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId } = requireContext(ctx)
  const raw = event.data as unknown as StripePaymentMethodShape

  const existing = await tx.billingPaymentMethod.findUnique({ where: { stripePaymentMethodId: raw.id } })
  if (!existing) {
    // Already gone — a redelivery, or it was never mirrored (attached before
    // this handler existed). Still audited: the trail should show Stripe
    // told us, even though there was nothing left to remove.
    await appendWebhookAudit({
      tx, orgId, action: 'billing.payment_method_removed', entityType: 'payment_method', entityId: null,
      stripeEventId: event.id, changes: null,
    })
    return
  }

  await tx.billingPaymentMethod.delete({ where: { stripePaymentMethodId: raw.id } })

  await appendWebhookAudit({
    tx, orgId, action: 'billing.payment_method_removed', entityType: 'payment_method', entityId: existing.id,
    stripeEventId: event.id,
    changes: diff({ brand: existing.brand, last4: existing.last4 }, {}),
  })
}

// ─── customer.subscription.trial_will_end ─────────────────────
// Recorded and audited only. Notification delivery (the email a customer
// should get when their trial is about to end) is NOT built in this PR —
// there is no email/notification service wired into billing yet. A handler
// that pretended to send one, or silently did nothing without saying so,
// would be worse than this explicit gap: see handlers-report.md.

export async function handleTrialWillEnd(tx: Tx, event: ProviderEvent, ctx: HandlerContext): Promise<void> {
  const { orgId, subscription } = requireContext(ctx)
  await appendWebhookAudit({
    tx, orgId, action: 'billing.trial_will_end', entityType: 'subscription', entityId: subscription.id,
    stripeEventId: event.id, changes: null,
  })
}

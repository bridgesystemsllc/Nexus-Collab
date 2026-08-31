// apps/api/src/services/billing/webhookProcessor.ts
import type { Prisma, PrismaClient } from '@prisma/client'
import type { Tx } from '../users/auditService'
import type { ProviderEvent } from './provider'
import { invalidateEntitlements } from './entitlementCache'
import {
  handleSubscriptionCreated, handleSubscriptionUpdated, handleSubscriptionDeleted,
  handleInvoicePaid, handleInvoicePaymentFailed, handleInvoiceUpcoming,
  handlePaymentMethodAttached, handlePaymentMethodDetached, handleTrialWillEnd,
} from './webhookHandlers'

// ─── Webhook processing: idempotency + ordering ──────────────
// The only writer of the subscription mirror (BillingSubscription,
// BillingInvoice, BillingPaymentMethod). Everything above this file — the
// route, the provider — only gets it a verified ProviderEvent; everything
// below decides whether, and how, that event is allowed to change anything.
//
// The per-event-type handlers themselves live in webhookHandlers.ts, kept
// separate from the machinery below on purpose: exactly-once recording via
// the BillingEvent unique constraint, retry bookkeeping, the out-of-order
// guard, and transactional apply-or-rollback are the same for every event
// type, so they live once here. A handler that gets this machinery wrong is
// a bug; a handler that never has to think about it is the point.

export type ProcessOutcome =
  | { status: 'processed'; eventId: string }
  | { status: 'duplicate'; eventId: string }
  | { status: 'stale'; eventId: string }
  | { status: 'unhandled'; eventId: string }
  | { status: 'failed'; eventId: string; error: string }

/// The minimal view of BillingSubscription the ordering guard and a handler
/// need. Typed locally (rather than importing the Prisma model type) so a
/// fake prisma in tests can satisfy it without pulling in `@prisma/client`'s
/// generated shape. Exported so webhookHandlers.ts can type against it
/// without importing from `@prisma/client` either.
export interface LinkedSubscription {
  id: string
  orgId: string
  lastStripeEventAt: Date | null
}

export interface HandlerContext {
  orgId: string | null
  /// Null when the event's Stripe customer id doesn't match any
  /// BillingSubscription row — Stripe knows about a customer we don't (a
  /// subscription created outside our own checkout route, e.g. directly in
  /// the Stripe dashboard, or a row somehow missing). Every handler in
  /// webhookHandlers.ts treats this as a hard failure (throws, so
  /// processEvent returns `failed` and Stripe retries) rather than a
  /// tolerated gap — silently no-oping here would drop a real billing event.
  subscription: LinkedSubscription | null
}

export type EventHandler = (tx: Tx, event: ProviderEvent, ctx: HandlerContext) => Promise<void>

/// The stub every table entry points to for now. Recognised as "no real
/// handler" by reference equality in `processEvent`, so a redeployment that
/// forgets to swap one in still returns `unhandled` rather than silently
/// no-oping while claiming `processed`.
async function unhandledHandler(): Promise<void> {
  // Intentionally empty. Every event type this table names (see
  // `eventHandlers` below) now has a real implementation in
  // webhookHandlers.ts; this stub only still matters for a Stripe event type
  // this table has never named — those are accepted (BillingEvent recorded,
  // 200 returned) but change nothing, rather than failing and retrying
  // forever for a type nobody has decided how to handle.
}

/// Event types spec §3.3 names, dispatched to their real implementations in
/// webhookHandlers.ts. `unhandledHandler` stays imported and checked for
/// below (rather than deleted) so a type this table drops back to stubbing —
/// or a type nobody has wired up yet — still returns `unhandled` instead of
/// silently claiming `processed`.
///
/// `ordered: true` is ONLY for a handler whose write is what
/// `BillingSubscription.lastStripeEventAt` protects — i.e. one that writes
/// the subscription fields the out-of-order guard exists for, and which
/// therefore also advances that same mark (see webhookHandlers.ts). That is
/// exactly the three `customer.subscription.*` handlers below.
///
/// Every other handler is `ordered: false` DELIBERATELY, not by omission:
/// `lastStripeEventAt` is a per-subscription mark, not a global one, and
/// invoice/payment-method/trial events do not own it. Gating them on it was
/// the exact bug this table's shape now prevents by construction — a
/// same-second `invoice.paid` landing before `customer.subscription.updated`
/// used to stamp the mark and cause the (older-by-a-second, but real)
/// subscription event to be discarded as stale, silently freezing
/// `currentPeriodEnd` at last period's value. Conversely an ordered event
/// advancing the mark used to cause a genuinely-current but older-stamped
/// `invoice.paid`/`payment_method.attached` to be dropped outright. Invoices
/// and payment methods have no ordering requirement of their own here — each
/// write (upsert-by-id, or a grace-period field guarded by its own
/// already-set check) is idempotent regardless of delivery order — so they
/// simply never entered the guard's scope at all.
export const eventHandlers: Record<string, { handler: EventHandler; ordered: boolean }> = {
  'customer.subscription.created': { handler: handleSubscriptionCreated, ordered: true },
  'customer.subscription.updated': { handler: handleSubscriptionUpdated, ordered: true },
  'customer.subscription.deleted': { handler: handleSubscriptionDeleted, ordered: true },
  'invoice.paid': { handler: handleInvoicePaid, ordered: false },
  'invoice.payment_failed': { handler: handleInvoicePaymentFailed, ordered: false },
  'invoice.upcoming': { handler: handleInvoiceUpcoming, ordered: false },
  'payment_method.attached': { handler: handlePaymentMethodAttached, ordered: false },
  'payment_method.detached': { handler: handlePaymentMethodDetached, ordered: false },
  'customer.subscription.trial_will_end': { handler: handleTrialWillEnd, ordered: false },
}

/// Stripe's convention: every object type this table cares about (a
/// subscription, an invoice, a payment method) carries the id of the
/// customer it belongs to, either as a bare string or `{ id }`. That id is
/// how an event is linked back to a BillingSubscription row without any
/// event-type-specific logic — the same lookup works for every type above.
/// Exported so webhookHandlers.ts can reuse the exact same duck-typing on
/// `previous_attributes.customer` for `payment_method.detached`, whose
/// top-level `customer` is null post-detachment — see that handler.
export function extractCustomerId(data: Record<string, unknown>): string | null {
  const customer = (data as { customer?: unknown }).customer
  if (typeof customer === 'string') return customer
  if (customer && typeof customer === 'object' && typeof (customer as { id?: unknown }).id === 'string') {
    return (customer as { id: string }).id
  }
  return null
}

function isUniqueConstraintViolation(err: unknown): boolean {
  // Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`
  // so a fake prisma in tests can simulate it with a plain `{ code }` object —
  // matching the convention already used in services/projects/numbering.ts.
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Record and, where a real handler exists, apply one webhook event.
 *
 * Contract (spec §3.3), in order:
 *  1. Insert into BillingEvent first — the unique constraint on
 *     `stripeEventId` is the idempotency guard, not a prior `findUnique`,
 *     which would race itself under concurrent redelivery.
 *  2. A row that already exists WITH `processedAt` set is a pure redelivery:
 *     return `duplicate` and do nothing else.
 *  3. A row that exists WITHOUT `processedAt` means a previous attempt failed
 *     or is in flight; bump `retryCount` and continue — that's what a retry
 *     is for.
 *  4. For an `ordered: true` handler ONLY, compare `event.createdAt` against
 *     that subscription's `lastStripeEventAt`. Strictly older → `stale`,
 *     nothing applied. A not-yet-set high-water mark is never stale — there
 *     is nothing to be older than. Equal-second is NOT stale and is applied
 *     — Stripe's `created` is second-granularity, so two events in the same
 *     second are common, and last-writer-wins is the right call: refusing
 *     the second would mean refusing a real, later event forever whenever
 *     two land in the same second. `ordered: false` handlers (invoice,
 *     payment-method, trial) skip this check entirely — see the contract
 *     comment on `eventHandlers` for why gating them on a per-subscription
 *     mark was itself the bug.
 *  5. Dispatch to the handler table inside a transaction. Success sets
 *     `processedAt`. A throw records `processingError`, bumps `retryCount`
 *     again (this attempt itself failed, distinct from #3's redelivery bump),
 *     and rolls back every write the handler made this attempt.
 *  6. `invalidateEntitlements(orgId)` runs last, after the transaction
 *     commits — invalidating from inside it could publish a cache miss that
 *     then reads pre-commit state. Wrapped in try/catch: it is a best-effort
 *     cache-freshness step on an event that has already committed, not part
 *     of the event's own correctness (the 60s TTL is the backstop) — letting
 *     a Redis blip turn a fully-applied event into an HTTP 500 would make
 *     Stripe retry it, land on the `processedAt`-is-set branch, and return
 *     `duplicate` forever without ever getting another invalidation attempt.
 */
export async function processEvent(prisma: PrismaClient, event: ProviderEvent): Promise<ProcessOutcome> {
  const customerId = extractCustomerId(event.data)
  const subscription = customerId
    ? await prisma.billingSubscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, orgId: true, lastStripeEventAt: true },
      })
    : null
  const orgId = subscription?.orgId ?? null

  // Step 1-3: insert first, using the unique constraint as the idempotency
  // guard rather than check-then-create, which races itself.
  try {
    await prisma.billingEvent.create({
      data: { stripeEventId: event.id, eventType: event.type, orgId, payload: event.data as unknown as Prisma.InputJsonValue },
    })
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err

    const existing = await prisma.billingEvent.findUniqueOrThrow({ where: { stripeEventId: event.id } })
    if (existing.processedAt) {
      // Another delivery already finished this event. Stripe redelivers on
      // any non-2xx; a handler applying twice is a double credit or a
      // double-fired email, so this must be a true no-op.
      return { status: 'duplicate', eventId: event.id }
    }
    // Recorded but never finished — a genuine retry. Bump the counter and
    // fall through to processing below with the same event.
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { retryCount: { increment: 1 } },
    })
  }

  const entry = eventHandlers[event.type]

  // Step 4: the out-of-order guard — ONLY for a handler that owns
  // lastStripeEventAt (see the contract comment on `eventHandlers`).
  // `lastStripeEventAt == null` means this subscription has never had an
  // ordered event applied — nothing for "older" to be relative to, so it is
  // explicitly NOT stale. Strictly `<`, not `<=`: an equal-second event
  // still applies (last writer wins — see the doc comment above).
  if (
    entry?.ordered &&
    subscription?.lastStripeEventAt &&
    event.createdAt < subscription.lastStripeEventAt
  ) {
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
    return { status: 'stale', eventId: event.id }
  }

  // Step 5: dispatch. An unrecognised type, or one still pointing at the
  // stub, is a deliberate no-op — recorded and acknowledged, never retried.
  if (!entry || entry.handler === unhandledHandler) {
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
    return { status: 'unhandled', eventId: event.id }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await entry.handler(tx, event, { orgId, subscription })
      await tx.billingEvent.update({
        where: { stripeEventId: event.id },
        data: { processedAt: new Date() },
      })
    })
  } catch (err) {
    const message = errorMessage(err)
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processingError: message, retryCount: { increment: 1 } },
    })
    return { status: 'failed', eventId: event.id, error: message }
  }

  // Step 6: last, and outside the transaction — see the contract note above.
  // Best-effort: a cache-invalidation failure must not turn an already-
  // committed event into a retry (see the doc comment on step 6).
  if (orgId) {
    try {
      await invalidateEntitlements(orgId)
    } catch (err) {
      console.error(`[billing webhook] entitlement cache invalidation failed for ${orgId} after event ${event.id} committed:`, errorMessage(err))
    }
  }
  return { status: 'processed', eventId: event.id }
}

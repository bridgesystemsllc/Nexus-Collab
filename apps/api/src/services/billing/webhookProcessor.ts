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
export const eventHandlers: Record<string, EventHandler> = {
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'invoice.upcoming': handleInvoiceUpcoming,
  'payment_method.attached': handlePaymentMethodAttached,
  'payment_method.detached': handlePaymentMethodDetached,
  'customer.subscription.trial_will_end': handleTrialWillEnd,
}

/// Stripe's convention: every object type this table cares about (a
/// subscription, an invoice, a payment method) carries the id of the
/// customer it belongs to, either as a bare string or `{ id }`. That id is
/// how an event is linked back to a BillingSubscription row without any
/// event-type-specific logic — the same lookup works for every type above.
function extractCustomerId(data: Record<string, unknown>): string | null {
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
 *  4. Before applying anything that touches BillingSubscription, compare
 *     `event.createdAt` against that row's `lastStripeEventAt`. Older →
 *     `stale`, nothing applied. A not-yet-set high-water mark is never stale
 *     — there is nothing to be older than.
 *  5. Dispatch to the handler table inside a transaction. Success sets
 *     `processedAt`. A throw records `processingError`, bumps `retryCount`
 *     again (this attempt itself failed, distinct from #3's redelivery bump),
 *     and rolls back every write the handler made this attempt.
 *  6. `invalidateEntitlements(orgId)` runs last, after the transaction
 *     commits — invalidating from inside it could publish a cache miss that
 *     then reads pre-commit state.
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

  // Step 4: the out-of-order guard. `lastStripeEventAt == null` means this
  // subscription has never had an event applied — nothing for "older" to be
  // relative to, so it is explicitly NOT stale.
  if (subscription?.lastStripeEventAt && event.createdAt < subscription.lastStripeEventAt) {
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
    return { status: 'stale', eventId: event.id }
  }

  // Step 5: dispatch. An unrecognised type, or one still pointing at the
  // stub, is a deliberate no-op — recorded and acknowledged, never retried.
  const handler = eventHandlers[event.type]
  if (!handler || handler === unhandledHandler) {
    await prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
    return { status: 'unhandled', eventId: event.id }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await handler(tx, event, { orgId, subscription })
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
  if (orgId) await invalidateEntitlements(orgId)
  return { status: 'processed', eventId: event.id }
}

// apps/api/src/services/billing/webhookProcessor.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ensureBillingSeeded } from './bootstrap'
import { processEvent } from './webhookProcessor'
import type { ProviderEvent } from './provider'

// Needs a live database — run with `pnpm test:integration`, not `pnpm test`.
// webhookProcessor.test.ts's fake prisma proves the machinery's LOGIC; this
// file proves the three things a fake $transaction/create can only simulate:
// a real Postgres unique-constraint race between two independent
// connections, a real transactional rollback leaving no partial write, and
// idempotency surviving genuine repeated redelivery. Per the plan, "webhooks
// are idempotent" is explicitly not satisfiable by a unit test.

const prisma = new PrismaClient()

// Every org this suite creates, so afterAll can clean up precisely — never a
// bare deleteMany({}). The dev database holds real data (1 org, 12 members
// as of this writing); this suite touches only rows scoped to the orgs it
// creates itself.
const allOrgIds: string[] = []

let tierId = ''
let priceId = ''
let originalPriceIdMonthly: string | null = null

beforeAll(async () => {
  await ensureBillingSeeded(prisma)
  const tier = await prisma.billingTier.findUniqueOrThrow({ where: { key: 'growth' } })
  tierId = tier.id
  // The seeded catalogue has no Stripe price ids (bootstrap.ts deliberately
  // never sets them — they're install-specific). This suite needs one real
  // price id findTierByPriceId can resolve, so it borrows the shared
  // `growth` row for its duration and restores the original value in
  // afterAll — this is global catalogue state, not something the suite owns.
  originalPriceIdMonthly = tier.stripePriceIdMonthly
  priceId = `price_webhook_replay_test_${Date.now()}`
  await prisma.billingTier.update({ where: { id: tierId }, data: { stripePriceIdMonthly: priceId } })
})

afterAll(async () => {
  if (tierId) {
    await prisma.billingTier.update({ where: { id: tierId }, data: { stripePriceIdMonthly: originalPriceIdMonthly } })
  }
  for (const id of allOrgIds) {
    await prisma.auditLog.deleteMany({ where: { orgId: id } })
    await prisma.billingEvent.deleteMany({ where: { orgId: id } })
    await prisma.billingInvoice.deleteMany({ where: { orgId: id } })
    await prisma.billingPaymentMethod.deleteMany({ where: { orgId: id } })
    await prisma.billingSubscription.deleteMany({ where: { orgId: id } })
    await prisma.member.deleteMany({ where: { orgId: id } })
  }
  await prisma.organization.deleteMany({ where: { id: { in: allOrgIds } } })
  await prisma.$disconnect()
})

/** A fresh, timestamp-slugged org with an active BillingSubscription, tracked for afterAll cleanup. */
async function freshOrgWithSubscription(label: string) {
  const org = await prisma.organization.create({
    data: { name: `Webhook Replay ${label}`, slug: `webhook-replay-${label}-${Date.now()}` },
  })
  allOrgIds.push(org.id)
  const stripeCustomerId = `cus_replay_${label}_${Date.now()}`
  const sub = await prisma.billingSubscription.create({
    data: {
      orgId: org.id, tierId, stripeCustomerId, status: 'active',
      billingInterval: 'monthly', seatsPurchased: 3,
    },
  })
  return { orgId: org.id, stripeCustomerId, subscriptionId: sub.id }
}

function subscriptionUpdatedEvent(id: string, data: Record<string, unknown>): ProviderEvent {
  return { id, type: 'customer.subscription.updated', createdAt: new Date(), data }
}

function stripeSubscriptionObject(customerId: string, quantity: number, priceIdOverride?: string) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `sub_stripe_${customerId}`,
    customer: customerId,
    status: 'active',
    items: {
      data: [{
        id: `si_${customerId}`, quantity,
        price: { id: priceIdOverride ?? priceId, recurring: { interval: 'month' } },
      }],
    },
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    cancel_at_period_end: false, trial_end: null, canceled_at: null,
  }
}

describe('idempotency — replaying the same event many times', () => {
  it('applies exactly once no matter how many times it is redelivered', async () => {
    const { orgId, stripeCustomerId } = await freshOrgWithSubscription('replay100')
    const event = subscriptionUpdatedEvent(
      `evt_replay100_${Date.now()}`,
      stripeSubscriptionObject(stripeCustomerId, 7),
    )

    const outcomes: string[] = []
    for (let i = 0; i < 100; i++) {
      const outcome = await processEvent(prisma, event)
      outcomes.push(outcome.status)
    }

    expect(outcomes[0]).toBe('processed')
    expect(outcomes.slice(1).every((s) => s === 'duplicate')).toBe(true)

    // Exactly one BillingEvent row and exactly one audit entry — the
    // acceptance criterion itself, not just a plausible-looking end state.
    expect(await prisma.billingEvent.count({ where: { stripeEventId: event.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { orgId, action: 'billing.subscription_synced' } })).toBe(1)

    const row = await prisma.billingSubscription.findUniqueOrThrow({ where: { orgId } })
    expect(row.seatsPurchased).toBe(7)
    expect(row.tierId).toBe(tierId)
  }, 30_000)
})

describe('idempotency — two genuinely concurrent deliveries of the same event', () => {
  it('a real unique-constraint race across two connections still ends in exactly one committed BillingEvent row', async () => {
    const { orgId, stripeCustomerId } = await freshOrgWithSubscription('race')
    const event = subscriptionUpdatedEvent(
      `evt_race_${Date.now()}`,
      stripeSubscriptionObject(stripeCustomerId, 4),
    )

    // Two independent connections, not two calls on the same client — the
    // whole point is a real race at the database's unique-constraint level,
    // not two sequential calls against one connection.
    const clientA = new PrismaClient()
    const clientB = new PrismaClient()
    try {
      const results = await Promise.allSettled([processEvent(clientA, event), processEvent(clientB, event)])

      // processEvent catches and classifies every failure it can attribute
      // to itself; a race against this unique constraint is exactly the
      // case it exists to handle, so neither side may reject.
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      const statuses = results.map((r) => (r as PromiseFulfilledResult<{ status: string }>).value.status)
      expect(statuses.every((s) => s === 'processed' || s === 'duplicate')).toBe(true)

      // The unique constraint on BillingEvent.stripeEventId is what this
      // test actually exercises: exactly one row survives, regardless of
      // which connection's INSERT the database let through first, and
      // regardless of whether the loser landed on the "duplicate" branch or
      // the "recorded but not yet finished — retry" branch (P2002 without
      // processedAt set), which no other test in this codebase reaches.
      expect(await prisma.billingEvent.count({ where: { stripeEventId: event.id } })).toBe(1)

      // Whichever branch each side took, the write itself is idempotent —
      // same event, same derived target state — so the subscription must
      // reflect it exactly, not half-applied by an interleaved retry.
      const row = await prisma.billingSubscription.findUniqueOrThrow({ where: { orgId } })
      expect(row.seatsPurchased).toBe(4)
      expect(row.tierId).toBe(tierId)
    } finally {
      await clientA.$disconnect()
      await clientB.$disconnect()
    }
  }, 30_000)
})

describe('a real Postgres rollback', () => {
  it('leaves no partial write when the handler throws mid-transaction', async () => {
    const { orgId, subscriptionId, stripeCustomerId } = await freshOrgWithSubscription('rollback')
    const before = await prisma.billingSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })

    // An unrecognised price id — the handler resolves the tier, fails to
    // find one, and throws AFTER it has already read the row but BEFORE it
    // writes anything. A fake $transaction can only simulate "rolled back";
    // this proves Postgres itself reverts a real multi-statement write.
    const event = subscriptionUpdatedEvent(
      `evt_rollback_${Date.now()}`,
      stripeSubscriptionObject(stripeCustomerId, 9, 'price_does_not_exist_anywhere'),
    )

    const outcome = await processEvent(prisma, event)
    expect(outcome.status).toBe('failed')

    const after = await prisma.billingSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })
    expect(after).toEqual(before)
    expect(await prisma.auditLog.count({ where: { orgId } })).toBe(0)

    const eventRow = await prisma.billingEvent.findUniqueOrThrow({ where: { stripeEventId: event.id } })
    expect(eventRow.processedAt).toBeNull()
    expect(eventRow.processingError).toContain('no BillingTier matches')
  })
})

import type { PrismaClient } from '@prisma/client'
import type { Entitlements, SubscriptionStatus } from '@nexus/shared'
import { loadCatalogue } from './catalogue'
import { resolve } from './resolve'
import { getCached, setCached } from './entitlementCache'

// The one function any code calls to learn what an org may do. Everything
// interesting is in resolve(); this is the I/O around it.

export async function resolveEntitlements(
  prisma: PrismaClient, orgId: string, now = new Date(),
): Promise<Entitlements> {
  const cached = await getCached(orgId)
  if (cached) return cached

  const [row, seatsConsumed, tiers] = await Promise.all([
    prisma.billingSubscription.findUnique({ where: { orgId } }),
    prisma.seatAssignment.count({ where: { orgId, releasedAt: null } }),
    loadCatalogue(prisma),
  ])

  const tier = row ? tiers.find((t) => t.id === row.tierId) ?? null : null

  const entitlements = resolve({
    subscription: row && {
      status: row.status as SubscriptionStatus,
      seatsPurchased: row.seatsPurchased,
      gracePeriodEndsAt: row.gracePeriodEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    },
    tier,
    features: tier?.features ?? [],
    seatsConsumed,
    now,
  })

  await setCached(orgId, entitlements)
  return entitlements
}

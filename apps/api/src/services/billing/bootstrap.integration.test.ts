import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ensureBillingSeeded } from './bootstrap'
import { TIER_CATALOGUE } from '@nexus/shared'

// Needs a live database — run with `pnpm test:integration`, not `pnpm test`.
// The trigger is the single most important line in the whole module: it is
// what makes "seats purchased can never fall below seats assigned" true under
// ANY sequence of operations, including ones no application code performs.

const prisma = new PrismaClient()
let orgId = ''
let tierId = ''

beforeAll(async () => {
  await ensureBillingSeeded(prisma)
  const org = await prisma.organization.create({
    data: { name: 'Seat Trigger Test Co', slug: `seat-trigger-${Date.now()}` },
  })
  orgId = org.id
  tierId = (await prisma.billingTier.findUniqueOrThrow({ where: { key: 'growth' } })).id
})

afterAll(async () => {
  await prisma.seatAssignment.deleteMany({ where: { orgId } })
  await prisma.billingSubscription.deleteMany({ where: { orgId } })
  await prisma.member.deleteMany({ where: { orgId } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.$disconnect()
})

async function member(email: string) {
  return prisma.member.create({
    data: { clerkUserId: `seat-${email}-${Date.now()}`, email, name: email, orgId },
  })
}

describe('ensureBillingSeeded', () => {
  it('seeds every tier in the catalogue', async () => {
    const rows = await prisma.billingTier.findMany()
    expect(rows.map((r) => r.key).sort()).toEqual(TIER_CATALOGUE.map((t) => t.key).sort())
  })

  it('seeds the feature matrix for each tier', async () => {
    const growth = await prisma.billingTier.findUniqueOrThrow({
      where: { key: 'growth' }, include: { features: true },
    })
    const spec = TIER_CATALOGUE.find((t) => t.key === 'growth')!
    expect(growth.features).toHaveLength(spec.features.length)
    expect(growth.features.map((f) => f.featureKey).sort())
      .toEqual(spec.features.map((f) => f.featureKey).sort())
  })

  it('is idempotent — a second run changes nothing', async () => {
    const before = await prisma.billingTier.count()
    const beforeFeatures = await prisma.billingTierFeature.count()
    await ensureBillingSeeded(prisma)
    expect(await prisma.billingTier.count()).toBe(before)
    expect(await prisma.billingTierFeature.count()).toBe(beforeFeatures)
  })
})

describe('the seat invariant trigger', () => {
  it('allows assignments up to the purchased count', async () => {
    await prisma.billingSubscription.create({
      data: { orgId, tierId, stripeCustomerId: 'cus_test', status: 'active',
              billingInterval: 'monthly', seatsPurchased: 2 },
    })
    const a = await member(`a-${Date.now()}@t.co`)
    const b = await member(`b-${Date.now()}@t.co`)
    await prisma.seatAssignment.create({ data: { orgId, memberId: a.id } })
    await prisma.seatAssignment.create({ data: { orgId, memberId: b.id } })
    expect(await prisma.seatAssignment.count({ where: { orgId, releasedAt: null } })).toBe(2)
  })

  it('refuses the assignment that would oversell', async () => {
    const c = await member(`c-${Date.now()}@t.co`)
    await expect(
      prisma.seatAssignment.create({ data: { orgId, memberId: c.id } }),
    ).rejects.toThrow(/seat_invariant_violated/)
  })

  it('refuses shrinking the subscription below the assigned count', async () => {
    await expect(
      prisma.billingSubscription.update({ where: { orgId }, data: { seatsPurchased: 1 } }),
    ).rejects.toThrow(/seat_invariant_violated/)
  })

  it('permits assign-and-expand in one transaction, because the check is deferred', async () => {
    // The whole reason the trigger is DEFERRABLE INITIALLY DEFERRED. Mid
    // transaction there are 3 assignments against 2 purchased seats; at
    // COMMIT there are 3 against 3.
    const d = await member(`d-${Date.now()}@t.co`)
    await prisma.$transaction([
      prisma.seatAssignment.create({ data: { orgId, memberId: d.id } }),
      prisma.billingSubscription.update({ where: { orgId }, data: { seatsPurchased: 3 } }),
    ])
    expect((await prisma.billingSubscription.findUniqueOrThrow({ where: { orgId } })).seatsPurchased).toBe(3)
  })

  it('refuses a second active assignment for the same member', async () => {
    const held = await prisma.seatAssignment.findFirstOrThrow({ where: { orgId, releasedAt: null } })
    await expect(
      prisma.seatAssignment.create({ data: { orgId, memberId: held.memberId } }),
    ).rejects.toThrow()
  })

  it('allows reassignment after release', async () => {
    const held = await prisma.seatAssignment.findFirstOrThrow({ where: { orgId, releasedAt: null } })
    await prisma.seatAssignment.update({ where: { id: held.id }, data: { releasedAt: new Date() } })
    const again = await prisma.seatAssignment.create({ data: { orgId, memberId: held.memberId } })
    expect(again.releasedAt).toBeNull()
  })
})

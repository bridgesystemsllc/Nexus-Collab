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

// Every org this suite creates, including the ones each test makes for
// itself, so afterAll can clean up precisely — never a bare deleteMany({}).
const allOrgIds: string[] = []

beforeAll(async () => {
  await ensureBillingSeeded(prisma)
  const org = await prisma.organization.create({
    data: { name: 'Seat Trigger Test Co', slug: `seat-trigger-${Date.now()}` },
  })
  orgId = org.id
  allOrgIds.push(orgId)
  tierId = (await prisma.billingTier.findUniqueOrThrow({ where: { key: 'growth' } })).id
})

afterAll(async () => {
  for (const id of allOrgIds) {
    await prisma.seatAssignment.deleteMany({ where: { orgId: id } })
    await prisma.billingSubscription.deleteMany({ where: { orgId: id } })
    await prisma.member.deleteMany({ where: { orgId: id } })
  }
  await prisma.organization.deleteMany({ where: { id: { in: allOrgIds } } })
  await prisma.$disconnect()
})

async function member(email: string, forOrgId: string = orgId) {
  return prisma.member.create({
    data: { clerkUserId: `seat-${email}-${Date.now()}`, email, name: email, orgId: forOrgId },
  })
}

/** A fresh, timestamp-slugged org, tracked for afterAll cleanup. */
async function freshOrg(label: string) {
  const org = await prisma.organization.create({
    data: { name: `Seat Trigger ${label}`, slug: `seat-trigger-${label}-${Date.now()}` },
  })
  allOrgIds.push(org.id)
  return org.id
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
    // Its own org with spare purchased seats, so the seat invariant is
    // definitively not what fires here. In the shared `orgId` suite above,
    // seats purchased == seats assigned by this point, so a duplicate insert
    // would ALSO violate the seat invariant — the assertion couldn't tell the
    // partial unique index apart from the seat count check, and would pass
    // exactly the same way if the index didn't exist at all.
    const dupOrgId = await freshOrg('dup-member')
    await prisma.billingSubscription.create({
      data: { orgId: dupOrgId, tierId, stripeCustomerId: 'cus_test_dup', status: 'active',
              billingInterval: 'monthly', seatsPurchased: 2 },
    })
    const held = await member(`held-${Date.now()}@t.co`, dupOrgId)
    await prisma.seatAssignment.create({ data: { orgId: dupOrgId, memberId: held.id } })

    // Prisma normalizes a Postgres 23505 into a P2002 and reformats the
    // message from the error's DETAIL (column list), discarding the primary
    // message that would otherwise contain the literal constraint name — so
    // the constraint name is not recoverable from `.message` here (verified
    // against this Prisma version), unlike the trigger's RAISE EXCEPTION
    // text, which Prisma cannot map to a known code and passes through raw
    // (that's why the trigger tests above can match /seat_invariant_violated/
    // in `.message`). P2002 + this exact column pair is the specific,
    // available signal that it was the partial unique index — not the
    // trigger — that fired: the trigger's exception surfaces with no `.code`
    // at all, so this positively rules it out rather than merely failing to
    // find a name.
    let error: unknown
    try {
      await prisma.seatAssignment.create({ data: { orgId: dupOrgId, memberId: held.id } })
    } catch (err) {
      error = err
    }
    expect(error).toMatchObject({ code: 'P2002', meta: { target: ['orgId', 'memberId'] } })
  })

  it('allows reassignment after release', async () => {
    const held = await prisma.seatAssignment.findFirstOrThrow({ where: { orgId, releasedAt: null } })
    await prisma.seatAssignment.update({ where: { id: held.id }, data: { releasedAt: new Date() } })
    const again = await prisma.seatAssignment.create({ data: { orgId, memberId: held.memberId } })
    expect(again.releasedAt).toBeNull()
  })

  it('refuses inserting a subscription whose seat count is already exceeded', async () => {
    // Defect 2's exact scenario: an org accumulates seat assignments with no
    // subscription row at all (the trigger returns early when purchased IS
    // NULL), then a subscription finally gets INSERTed under-counting what is
    // already assigned. Without a trigger on INSERT this lands silently and
    // wedges every later UPDATE to the row (renewals, plan changes, any
    // webhook) behind a violation that already existed before they ran.
    const wedgeOrgId = await freshOrg('insert-wedge')
    const m1 = await member(`wedge1-${Date.now()}@t.co`, wedgeOrgId)
    const m2 = await member(`wedge2-${Date.now()}@t.co`, wedgeOrgId)
    await prisma.seatAssignment.create({ data: { orgId: wedgeOrgId, memberId: m1.id } })
    await prisma.seatAssignment.create({ data: { orgId: wedgeOrgId, memberId: m2.id } })

    await expect(
      prisma.billingSubscription.create({
        data: { orgId: wedgeOrgId, tierId, stripeCustomerId: 'cus_test_wedge', status: 'active',
                billingInterval: 'monthly', seatsPurchased: 1 },
      }),
    ).rejects.toThrow(/seat_invariant_violated/)
  })

  it('always permits deleting a seat assignment', async () => {
    // Deleting an assignment can only reduce consumed seats, never increase
    // it, so it must be permitted regardless of how tight the org already is.
    const tightOrgId = await freshOrg('delete-always-ok')
    await prisma.billingSubscription.create({
      data: { orgId: tightOrgId, tierId, stripeCustomerId: 'cus_test_tight', status: 'active',
              billingInterval: 'monthly', seatsPurchased: 1 },
    })
    const m = await member(`tight-${Date.now()}@t.co`, tightOrgId)
    const assignment = await prisma.seatAssignment.create({ data: { orgId: tightOrgId, memberId: m.id } })
    await expect(prisma.seatAssignment.delete({ where: { id: assignment.id } })).resolves.toBeTruthy()
  })

  it('serialises two genuinely concurrent seat assignments against a 1-seat org — exactly one wins', async () => {
    // The headline defect this trigger work exists to close, and the one
    // scenario every other test in this file cannot exercise: they all run
    // one statement (or one transaction) at a time against a single Prisma
    // connection, so the same assertions pass identically whether the trigger
    // locks the subscription row BEFORE counting or counts first and locks
    // after — sequential execution never lets two transactions overlap. Two
    // separate PrismaClient instances (separate connections, separate
    // Postgres backends) racing two interactive transactions is what actually
    // exercises the ordering: without the lock-before-count fix (and now the
    // org-scoped advisory lock ahead of it), both can read "0 assigned" for
    // the other's uncommitted insert and both commit, oversold.
    const raceOrgId = await freshOrg('concurrent-race')
    await prisma.billingSubscription.create({
      data: { orgId: raceOrgId, tierId, stripeCustomerId: 'cus_test_race', status: 'active',
              billingInterval: 'monthly', seatsPurchased: 1 },
    })
    const m1 = await member(`race1-${Date.now()}@t.co`, raceOrgId)
    const m2 = await member(`race2-${Date.now()}@t.co`, raceOrgId)

    const clientA = new PrismaClient()
    const clientB = new PrismaClient()
    try {
      // A bare `await create()` on each side races the network, not the
      // invariant: whichever transaction's COMMIT round-trip happens to land
      // first at the OS/driver level reaches the deferred trigger uncontested,
      // and the "loser" — starting only after the winner has already
      // committed — sees the winner's row as already-committed data, not as a
      // concurrent write, at every isolation level, so the test would pass
      // even against the old "count first, lock after" ordering. The
      // `pg_sleep` forces both to hold an open, uncommitted INSERT at the same
      // wall-clock moment before either commits, which is what actually
      // exercises the advisory lock's contention.
      //
      // Array-form `$transaction`, not the interactive callback form: verified
      // by hand (raw two-session psql, and array-form vs. callback-form with
      // this exact race) that the database always does the right thing
      // either way — exactly one session's COMMIT is rejected with
      // seat_invariant_violated and exactly one row lands — but this Prisma
      // version's interactive-callback `$transaction(async tx => …)` does not
      // reliably surface a same-connection COMMIT-time deferred-constraint
      // failure as a rejected promise when a SECOND, independent connection
      // is what makes it fail (single-connection deferred failures, as in
      // every other test below, propagate correctly through both forms).
      // Array-form does surface it. Since what's under test here is the
      // database invariant — not which Prisma transaction API best reports a
      // commit failure — array-form is the correct tool, and matches this
      // file's existing convention for multi-statement deferred-trigger
      // assertions (see "permits assign-and-expand" above).
      const race = (client: PrismaClient, memberId: string) => client.$transaction([
        client.seatAssignment.create({ data: { orgId: raceOrgId, memberId } }),
        client.$executeRawUnsafe('SELECT pg_sleep(0.3)'),
      ])
      const results = await Promise.allSettled([race(clientA, m1.id), race(clientB, m2.id)])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(String(rejected[0].reason)).toMatch(/seat_invariant_violated/)

      const committed = await prisma.seatAssignment.count({ where: { orgId: raceOrgId, releasedAt: null } })
      expect(committed).toBe(1)
    } finally {
      await clientA.$disconnect()
      await clientB.$disconnect()
    }
  })
})

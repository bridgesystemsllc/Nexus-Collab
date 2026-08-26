import type { PrismaClient } from '@prisma/client'
import { TIER_CATALOGUE } from '@nexus/shared'

// ─── Billing bootstrap ───────────────────────────────────────
// Two things the application cannot function without and that `prisma db push`
// cannot create: the tier catalogue, and the seat invariant.
//
// Nexus has no `prisma migrate` history — the schema is applied with db push
// and structural invariants live in idempotent boot-time ensures. This follows
// ensureRbacSeeded exactly, for the same reason: a seed script somebody has to
// remember to run is a seed script that did not run in production.

export interface BillingBootstrapResult {
  ran: boolean
  tiersSeeded: number
  featuresSeeded: number
  constraintsApplied: boolean
  error?: string
}

/**
 * seatsPurchased >= count(active SeatAssignment), enforced by the database.
 *
 * A CHECK constraint cannot contain a subquery, so this is a constraint
 * trigger. DEFERRABLE INITIALLY DEFERRED matters: assigning a seat and
 * expanding the subscription is one transaction that is legitimately in
 * violation between its two statements, and a per-statement check would refuse
 * the very operation the product is built around.
 *
 * The application checks this too, under a row lock. The trigger is the
 * backstop, not the error path — it cannot produce a message a user should
 * read, and it cannot audit.
 */
const SEAT_INVARIANT_SQL = [
  `CREATE OR REPLACE FUNCTION billing_assert_seat_invariant() RETURNS TRIGGER AS $fn$
   DECLARE target_org TEXT; consumed INT; purchased INT;
   BEGIN
     target_org := COALESCE(NEW."orgId", OLD."orgId");
     -- Lock the subscription row BEFORE counting, not after. Under READ
     -- COMMITTED, two concurrent transactions assigning seats to different
     -- members don't conflict on the partial unique index and don't block
     -- each other, so both can count the other's uncommitted (invisible) row
     -- as absent and both pass: seatsPurchased=1 with zero assignments lets
     -- T1 assign to A, T2 assign to B, both commit, 2 assigned against 1
     -- purchased. FOR UPDATE makes T2 block on T1's row lock and then re-read
     -- the latest committed state once granted, so it correctly counts both.
     -- Do not swap this order back to "count first, lock after" — that
     -- reintroduces the oversell.
     SELECT "seatsPurchased" INTO purchased FROM "BillingSubscription"
       WHERE "orgId" = target_org FOR UPDATE;
     -- No subscription means nothing to oversell. Seats assigned without one
     -- are a separate problem and not this trigger's to refuse.
     IF purchased IS NULL THEN RETURN NULL; END IF;
     SELECT count(*) INTO consumed FROM "SeatAssignment"
       WHERE "orgId" = target_org AND "releasedAt" IS NULL;
     IF consumed > purchased THEN
       RAISE EXCEPTION 'seat_invariant_violated: org % holds % assigned seats against % purchased',
         target_org, consumed, purchased;
     END IF;
     RETURN NULL;
   END;
   $fn$ LANGUAGE plpgsql;`,

  // CREATE CONSTRAINT TRIGGER has no OR REPLACE, so drop first to stay idempotent.
  `DROP TRIGGER IF EXISTS billing_seat_invariant_assign ON "SeatAssignment";`,
  `CREATE CONSTRAINT TRIGGER billing_seat_invariant_assign
     AFTER INSERT OR UPDATE OR DELETE ON "SeatAssignment"
     DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION billing_assert_seat_invariant();`,

  // Must fire on INSERT too, not just UPDATE. Without it, an org with no
  // subscription row accumulates unlimited seat assignments unchecked (the
  // function returns early when purchased IS NULL), and the first INSERT of
  // a subscription row — which is exactly when a real seat count first
  // exists to check against — fires no trigger at all. That leaves the org
  // permanently over its seat count, and wedged: the next legitimate UPDATE
  // (a renewal, a plan change, any webhook touching this row) fires the
  // UPDATE trigger, finds the pre-existing violation, and raises — so every
  // subsequent webhook for that org fails forever. Checking on INSERT closes
  // that hole at the one moment it can still be closed.
  `DROP TRIGGER IF EXISTS billing_seat_invariant_subscription ON "BillingSubscription";`,
  `CREATE CONSTRAINT TRIGGER billing_seat_invariant_subscription
     AFTER INSERT OR UPDATE ON "BillingSubscription"
     DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION billing_assert_seat_invariant();`,

  // One ACTIVE assignment per member per org. Prisma 5 cannot express a
  // partial unique index, and a plain unique on (orgId, memberId) would make
  // a released seat unreassignable forever.
  `CREATE UNIQUE INDEX IF NOT EXISTS "SeatAssignment_active_unique"
     ON "SeatAssignment" ("orgId", "memberId") WHERE "releasedAt" IS NULL;`,
]

export async function ensureBillingSeeded(prisma: PrismaClient): Promise<BillingBootstrapResult> {
  const result: BillingBootstrapResult = {
    ran: false, tiersSeeded: 0, featuresSeeded: 0, constraintsApplied: false,
  }
  try {
    // Each $executeRawUnsafe is its own implicit transaction by default, so
    // running these one at a time leaves a window — between the DROP and the
    // CREATE CONSTRAINT TRIGGER — where the invariant is unenforced, and it
    // takes the DROP's ACCESS EXCLUSIVE lock on SeatAssignment on every
    // process start for no reason. One transaction makes the whole sequence
    // atomic: either every statement lands or none do.
    await prisma.$transaction(async (tx) => {
      for (const statement of SEAT_INVARIANT_SQL) {
        await tx.$executeRawUnsafe(statement)
      }
    })
    result.constraintsApplied = true

    for (const spec of TIER_CATALOGUE) {
      // Upsert the row but do NOT overwrite the Stripe price ids or the
      // amounts: those are install-specific and an admin may have edited them.
      // Restoring a missing tier is the job; resetting a configured one is not.
      const tier = await prisma.billingTier.upsert({
        where: { key: spec.key },
        update: {
          displayName: spec.displayName, description: spec.description,
          sortOrder: spec.sortOrder, rank: spec.rank,
          minSeats: spec.minSeats, maxSeats: spec.maxSeats,
          isCustomQuote: spec.isCustomQuote,
        },
        create: {
          key: spec.key, displayName: spec.displayName, description: spec.description,
          sortOrder: spec.sortOrder, rank: spec.rank,
          unitAmountMonthlyCents: spec.unitAmountMonthlyCents,
          unitAmountAnnualCents: spec.unitAmountAnnualCents,
          minSeats: spec.minSeats, maxSeats: spec.maxSeats,
          isCustomQuote: spec.isCustomQuote, isActive: true,
        },
      })
      result.tiersSeeded++

      for (const feature of spec.features) {
        await prisma.billingTierFeature.upsert({
          where: { tierId_featureKey: { tierId: tier.id, featureKey: feature.featureKey } },
          update: { isEnabled: feature.isEnabled, limitValue: feature.limitValue },
          create: {
            tierId: tier.id, featureKey: feature.featureKey,
            isEnabled: feature.isEnabled, limitValue: feature.limitValue,
          },
        })
        result.featuresSeeded++
      }
    }

    result.ran = true
    return result
  } catch (err) {
    // Same posture as ensureRbacSeeded: never throw. A workspace that cannot
    // seed its tiers is a serious problem; taking the API down with it turns
    // "the billing page is empty" into "Nexus is offline", which is worse.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[billing] bootstrap failed:', message)
    return { ...result, error: message }
  }
}

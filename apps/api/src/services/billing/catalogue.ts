import type { PrismaClient } from '@prisma/client'
import type { FeatureKey, TierKey } from '@nexus/shared'

// ─── Tier catalogue ──────────────────────────────────────────
// The DB rows are authoritative at runtime — an admin may change a price
// without a deploy, and TIER_CATALOGUE in @nexus/shared is only what a fresh
// database is filled with.
//
// Memoised for 60s. Reading four rows on every entitlement resolution would
// make the catalogue the hottest query in the system for data that changes
// perhaps twice a year.

export interface TierFeatureRecord {
  featureKey: FeatureKey
  isEnabled: boolean
  limitValue: number | null
}

export interface TierRecord {
  id: string
  key: TierKey
  displayName: string
  description: string | null
  sortOrder: number
  rank: number
  stripePriceIdMonthly: string | null
  stripePriceIdAnnual: string | null
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  /// null means unlimited. Always compare through exceedsSeatCeiling().
  maxSeats: number | null
  isCustomQuote: boolean
  features: TierFeatureRecord[]
}

const TTL_MS = 60_000
let cache: { at: number; tiers: TierRecord[] } | null = null

/** Drop the memo. Called by the webhook processor and by any catalogue edit. */
export function invalidateCatalogue(): void {
  cache = null
}

export async function loadCatalogue(prisma: PrismaClient): Promise<TierRecord[]> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.tiers

  const rows = await prisma.billingTier.findMany({
    where: { isActive: true },
    orderBy: { rank: 'asc' },
    include: { features: true },
  })

  // The query already applies `where: { isActive: true }` and `orderBy: { rank:
  // 'asc' }`, but both are re-applied here rather than trusted blindly: a
  // retired plan reaching a checkout is a sold-a-thing-we-can't-honour bug,
  // not a cosmetic one, so filtering and ordering are enforced in application
  // code too, not delegated entirely to how a given Prisma call is invoked.
  const tiers = rows
    .filter((r: any) => r.isActive)
    .map((r: any): TierRecord => ({
      id: r.id, key: r.key, displayName: r.displayName, description: r.description,
      sortOrder: r.sortOrder, rank: r.rank,
      stripePriceIdMonthly: r.stripePriceIdMonthly, stripePriceIdAnnual: r.stripePriceIdAnnual,
      unitAmountMonthlyCents: r.unitAmountMonthlyCents,
      unitAmountAnnualCents: r.unitAmountAnnualCents,
      minSeats: r.minSeats, maxSeats: r.maxSeats, isCustomQuote: r.isCustomQuote,
      features: r.features.map((f: any) => ({
        featureKey: f.featureKey, isEnabled: f.isEnabled, limitValue: f.limitValue,
      })),
    }))
    .sort((a, b) => a.rank - b.rank)

  cache = { at: now, tiers }
  return tiers
}

/** The active tier for a key, or null. Used by the change-tier route in B8. */
export async function findTier(prisma: PrismaClient, key: string): Promise<TierRecord | null> {
  return (await loadCatalogue(prisma)).find((t) => t.key === key) ?? null
}

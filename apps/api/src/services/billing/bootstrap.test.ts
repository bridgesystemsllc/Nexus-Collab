import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { ensureBillingSeeded } from './bootstrap'
import { TIER_CATALOGUE } from '@nexus/shared'

// Unit-level, no database: a fake prisma that records what ensureBillingSeeded
// hands to billingTier.upsert. The one thing this guards is a refactor moving
// the price fields into `update` — that would restore a missing tier exactly
// as well as today, and would pass every other test in this suite (including
// the integration ones, which never reseed over an admin-edited price), while
// silently resetting a live install's Stripe prices to catalogue defaults on
// every boot. See the comment on the upsert call in bootstrap.ts.

const FORBIDDEN_UPDATE_KEYS = [
  'unitAmountMonthlyCents',
  'unitAmountAnnualCents',
  'stripePriceIdMonthly',
  'stripePriceIdAnnual',
]

describe('ensureBillingSeeded — tier upsert does not clobber install-specific fields', () => {
  it('never puts price/Stripe fields in the `update` clause, for any tier in the catalogue', async () => {
    const updateCalls: Record<string, unknown>[] = []

    const fakePrisma = {
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({ $executeRawUnsafe: async () => undefined }),
      billingTier: {
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          updateCalls.push(update)
          return { id: 'tier_fake' }
        },
      },
      billingTierFeature: {
        upsert: async () => ({}),
      },
    } as unknown as PrismaClient

    const result = await ensureBillingSeeded(fakePrisma)

    expect(result.ran).toBe(true)
    expect(result.error).toBeUndefined()
    expect(updateCalls).toHaveLength(TIER_CATALOGUE.length)

    for (const update of updateCalls) {
      for (const forbidden of FORBIDDEN_UPDATE_KEYS) {
        expect(Object.keys(update)).not.toContain(forbidden)
      }
    }
  })
})

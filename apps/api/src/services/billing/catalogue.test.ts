import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCatalogue, invalidateCatalogue } from './catalogue'

const rows = [
  { id: 't2', key: 'growth', displayName: 'Growth', description: null, sortOrder: 20, rank: 20,
    stripePriceIdMonthly: 'price_m', stripePriceIdAnnual: 'price_a',
    unitAmountMonthlyCents: 5900, unitAmountAnnualCents: 59000,
    minSeats: 5, maxSeats: 50, isCustomQuote: false, isActive: true,
    features: [{ featureKey: 'api_read', isEnabled: true, limitValue: null }] },
  { id: 't1', key: 'starter', displayName: 'Starter', description: null, sortOrder: 10, rank: 10,
    stripePriceIdMonthly: null, stripePriceIdAnnual: null,
    unitAmountMonthlyCents: 2900, unitAmountAnnualCents: 29000,
    minSeats: 3, maxSeats: 15, isCustomQuote: false, isActive: true,
    features: [] },
  { id: 't0', key: 'retired', displayName: 'Retired', description: null, sortOrder: 5, rank: 5,
    stripePriceIdMonthly: null, stripePriceIdAnnual: null,
    unitAmountMonthlyCents: 100, unitAmountAnnualCents: 1000,
    minSeats: 1, maxSeats: 2, isCustomQuote: false, isActive: false,
    features: [] },
]

const fakePrisma = () => ({ billingTier: { findMany: vi.fn(async () => rows) } }) as any

beforeEach(() => invalidateCatalogue())

describe('loadCatalogue', () => {
  it('returns active tiers in rank order', async () => {
    const prisma = fakePrisma()
    const tiers = await loadCatalogue(prisma)
    expect(tiers.map((t) => t.key)).toEqual(['starter', 'growth'])
    // The fake's findMany ignores its arguments, so without this the real
    // query's own correctness is asserted nowhere: dropping `where: {
    // isActive: true }` from the Prisma call would still pass this suite.
    expect(prisma.billingTier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: { rank: 'asc' } }),
    )
  })

  it('excludes inactive tiers — a retired plan must not be sellable', async () => {
    const tiers = await loadCatalogue(fakePrisma())
    expect(tiers.find((t) => t.key === 'retired')).toBeUndefined()
  })

  it('memoises within the TTL', async () => {
    const prisma = fakePrisma()
    await loadCatalogue(prisma)
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(1)
  })

  it('re-reads after invalidateCatalogue', async () => {
    const prisma = fakePrisma()
    await loadCatalogue(prisma)
    invalidateCatalogue()
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(2)
  })

  it('re-reads once the TTL has elapsed', async () => {
    const prisma = fakePrisma()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    await loadCatalogue(prisma)
    now.mockReturnValue(1_000 + 61_000)
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })
})

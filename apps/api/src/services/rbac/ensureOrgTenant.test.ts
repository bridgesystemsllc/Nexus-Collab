import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { planBackfill, findInOrgEmailCollisions } from './ensureOrgTenant'

// planBackfill is the decision; ensureOrgTenantBackfill is the I/O around it.
// Splitting them is what makes "refuses to guess" testable without a database.

describe('planBackfill', () => {
  it('claims the configured tenant for a lone unclaimed org', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: null }], 'tenant-1'))
      .toEqual({ action: 'claim', orgId: 'org_a', tenantId: 'tenant-1' })
  })

  it('does nothing when the org already has a tenant', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: 'tenant-1' }], 'tenant-1'))
      .toEqual({ action: 'noop', reason: 'already-claimed' })
  })

  it('refuses rather than guessing when several orgs are unclaimed', () => {
    // Picking one here would recreate the exact defect Task 4 removed.
    expect(planBackfill(
      [{ id: 'org_a', entraTenantId: null }, { id: 'org_b', entraTenantId: null }], 'tenant-1',
    )).toEqual({ action: 'refuse', reason: 'ambiguous' })
  })

  it('does nothing when no tenant is configured', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: null }], ''))
      .toEqual({ action: 'noop', reason: 'no-tenant-configured' })
  })

  it('does nothing when there are no orgs at all', () => {
    expect(planBackfill([], 'tenant-1')).toEqual({ action: 'noop', reason: 'no-orgs' })
  })
})

// findInOrgEmailCollisions is an operator tool, not part of boot — these
// tests only cover the mapping from the raw query row shape to `Collision`,
// with a fake prisma so no database is involved.

describe('findInOrgEmailCollisions', () => {
  it('maps queryRaw rows (a collision group and a clean one) onto the Collision shape', async () => {
    const fakePrisma = {
      $queryRaw: async () => [
        { orgId: 'org_a', email: 'dup@kareve.com', ids: ['mem_1', 'mem_2'] },
        { orgId: 'org_b', email: 'solo@kareve.com', ids: ['mem_3'] },
      ],
    } as unknown as PrismaClient

    expect(await findInOrgEmailCollisions(fakePrisma)).toEqual([
      { orgId: 'org_a', email: 'dup@kareve.com', memberIds: ['mem_1', 'mem_2'] },
      { orgId: 'org_b', email: 'solo@kareve.com', memberIds: ['mem_3'] },
    ])
  })

  it('returns an empty array when nothing collides', async () => {
    const fakePrisma = { $queryRaw: async () => [] } as unknown as PrismaClient
    expect(await findInOrgEmailCollisions(fakePrisma)).toEqual([])
  })
})

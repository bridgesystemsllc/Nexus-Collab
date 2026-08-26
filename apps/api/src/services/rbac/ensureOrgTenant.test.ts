import { describe, it, expect, vi } from 'vitest'
import { planBackfill } from './ensureOrgTenant'

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

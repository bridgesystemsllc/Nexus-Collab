import { describe, it, expect, vi } from 'vitest'
import { resolveOrgForLogin } from './session'

// The bug this replaces: organization.findFirst({ orderBy: { createdAt: 'asc' } }).
// Every person who ever signed in landed in the oldest workspace, whoever they
// worked for. These tests exist to make that behaviour unreachable.

function fakePrisma(orgs: Array<{ id: string; entraTenantId: string | null }>) {
  return {
    organization: {
      findUnique: vi.fn(async ({ where }: any) =>
        orgs.find((o) => o.entraTenantId === where.entraTenantId) ?? null),
      findFirst: vi.fn(async () => orgs[0] ?? null),
    },
  } as any
}

describe('resolveOrgForLogin', () => {
  it('matches the org registered to the Entra tenant', async () => {
    const prisma = fakePrisma([
      { id: 'org_old', entraTenantId: 'tenant-1' },
      { id: 'org_new', entraTenantId: 'tenant-2' },
    ])
    const org = await resolveOrgForLogin(prisma, { tenantId: 'tenant-2', email: 'a@b.com' })
    expect(org?.id).toBe('org_new')
  })

  it('returns null for an unregistered tenant rather than the oldest org', async () => {
    // The old code returned org_old here. That is the whole defect.
    const prisma = fakePrisma([{ id: 'org_old', entraTenantId: 'tenant-1' }])
    const org = await resolveOrgForLogin(prisma, { tenantId: 'tenant-999', email: 'a@b.com' })
    expect(org).toBeNull()
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when the token carried no tenant id', async () => {
    const prisma = fakePrisma([{ id: 'org_old', entraTenantId: 'tenant-1' }])
    expect(await resolveOrgForLogin(prisma, { tenantId: null, email: 'a@b.com' })).toBeNull()
  })

  it('never falls back to findFirst even when exactly one org exists', async () => {
    // A single-org install is the tempting case to special-case. Doing so is
    // how the defect comes back the day a second customer is created.
    const prisma = fakePrisma([{ id: 'only', entraTenantId: null }])
    expect(await resolveOrgForLogin(prisma, { tenantId: 'tenant-1', email: 'a@b.com' })).toBeNull()
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
  })
})

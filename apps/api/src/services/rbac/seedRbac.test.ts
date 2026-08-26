import { describe, it, expect } from 'vitest'
import { seedRbac } from './bootstrap'

// seedRbac's fullSeed split (Commit 3): adding a permission to an
// already-seeded workspace must not become "an owner got elected", and the
// owner election itself must be scoped per organization — an install-wide
// count promotes one person as owner of the entire multi-tenant install and
// leaves every other organization without one.
//
// A small in-memory fake stands in for Prisma so these scenarios (two orgs,
// nobody promoted across a tenant boundary, a drift reconcile that elects
// nobody) are provable without a database.

interface FakeMember {
  id: string
  orgId: string
  role: string
  roleId: string | null
  lifecycleStatus: string
  createdAt: Date
  email: string
}

function matches(m: FakeMember, where: Record<string, unknown>, preferences: Set<string>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'preference') {
      if (v === null && preferences.has(m.id)) return false
      continue
    }
    if (v && typeof v === 'object' && 'in' in (v as any)) {
      if (!(v as any).in.includes((m as any)[k])) return false
      continue
    }
    if ((m as any)[k] !== v) return false
  }
  return true
}

function fakePrisma(organizations: { id: string }[], initialMembers: FakeMember[]) {
  const members: FakeMember[] = initialMembers.map((m) => ({ ...m }))
  const roles = new Map<string, { id: string; key: string }>()
  const rolePermissions = new Map<string, Set<string>>()
  const preferences = new Set<string>()
  let roleSeq = 0

  const sortByCreatedAt = (list: FakeMember[]) =>
    [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const prisma = {
    permission: {
      upsert: async () => ({}),
    },
    role: {
      upsert: async ({ where, create }: any) => {
        let r = roles.get(where.key)
        if (!r) {
          r = { id: `role_${++roleSeq}`, key: where.key }
          roles.set(where.key, r)
        }
        return r
      },
      findMany: async () => Array.from(roles.values()),
    },
    rolePermission: {
      deleteMany: async ({ where }: any) => {
        const set = rolePermissions.get(where.roleId) ?? new Set<string>()
        const notIn: string[] = where.permissionKey.notIn
        for (const k of Array.from(set)) if (!notIn.includes(k)) set.delete(k)
        rolePermissions.set(where.roleId, set)
      },
      upsert: async ({ create }: any) => {
        const set = rolePermissions.get(create.roleId) ?? new Set<string>()
        set.add(create.permissionKey)
        rolePermissions.set(create.roleId, set)
      },
    },
    member: {
      findMany: async ({ where, orderBy }: any) => {
        let list = members.filter((m) => matches(m, where ?? {}, preferences))
        if (orderBy?.createdAt === 'asc') list = sortByCreatedAt(list)
        return list
      },
      findFirst: async ({ where, orderBy }: any) => {
        let list = members.filter((m) => matches(m, where ?? {}, preferences))
        if (orderBy?.createdAt === 'asc') list = sortByCreatedAt(list)
        return list[0] ?? null
      },
      count: async ({ where }: any) => members.filter((m) => matches(m, where ?? {}, preferences)).length,
      update: async ({ where, data }: any) => {
        const m = members.find((x) => x.id === where.id)!
        Object.assign(m, data)
        return m
      },
    },
    organization: {
      findMany: async () => organizations,
    },
    userPreference: {
      create: async ({ data }: any) => {
        preferences.add(data.memberId)
        return { id: `pref_${data.memberId}` }
      },
    },
  }

  return { prisma: prisma as any, members }
}

describe('seedRbac — owner election', () => {
  it('elects an owner per organization, never promoting a member into an org they do not belong to', async () => {
    const orgA = { id: 'org_a' }
    const orgB = { id: 'org_b' }
    const t = (days: number) => new Date(2026, 0, 1 + days)

    const { prisma, members } = fakePrisma([orgA, orgB], [
      { id: 'mem_a1', orgId: 'org_a', role: 'ADMIN', roleId: null, lifecycleStatus: 'active', createdAt: t(0), email: 'a1@a.com' },
      { id: 'mem_a2', orgId: 'org_a', role: 'MEMBER', roleId: null, lifecycleStatus: 'active', createdAt: t(1), email: 'a2@a.com' },
      { id: 'mem_b1', orgId: 'org_b', role: 'ADMIN', roleId: null, lifecycleStatus: 'active', createdAt: t(2), email: 'b1@b.com' },
    ])

    const result = await seedRbac(prisma, { fullSeed: true })

    // Both orgs got an owner — not one owner for the whole install.
    expect(result.ownersAssigned.sort()).toEqual(['a1@a.com', 'b1@b.com'])

    const ownerRoleId = members.find((m) => m.id === 'mem_a1')!.roleId
    expect(members.find((m) => m.id === 'mem_b1')!.roleId).toBe(ownerRoleId)

    // The org_a member never became org_b's owner, and vice versa: the
    // non-admin org_a member kept a non-owner role.
    expect(members.find((m) => m.id === 'mem_a2')!.roleId).not.toBe(ownerRoleId)
  })

  it('does not elect an owner on the drift path (fullSeed: false)', async () => {
    const orgA = { id: 'org_a' }
    const t = (days: number) => new Date(2026, 0, 1 + days)

    const { prisma, members } = fakePrisma([orgA], [
      { id: 'mem_a1', orgId: 'org_a', role: 'ADMIN', roleId: null, lifecycleStatus: 'active', createdAt: t(0), email: 'a1@a.com' },
    ])

    const result = await seedRbac(prisma, { fullSeed: false })

    // A permission being added must not become "an owner got elected" —
    // an org that deliberately has zero owners right now must stay that way.
    expect(result.ownersAssigned).toEqual([])
    expect(result.membersMapped).toBe(0)
    expect(members.find((m) => m.id === 'mem_a1')!.roleId).toBeNull()
  })
})

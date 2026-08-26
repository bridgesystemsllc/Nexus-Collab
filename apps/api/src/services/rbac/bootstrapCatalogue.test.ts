import { describe, it, expect, vi } from 'vitest'
import { ALL_PERMISSION_KEYS, SYSTEM_ROLES } from '@nexus/shared'
import { ensureRbacSeeded } from './bootstrap'

// The regression this guards: adding a permission to the catalogue after a
// workspace has been seeded once. Before this, the boot check asked "is the
// catalogue empty?", the answer was "no", and the new permission never landed.

const fakePrisma = (keys: string[]) => ({
  permission: { findMany: vi.fn(async () => keys.map((key) => ({ key }))) },
  role: { count: vi.fn(async () => 5) },
}) as any

describe('ensureRbacSeeded', () => {
  it('does nothing when the catalogue is complete', async () => {
    const result = await ensureRbacSeeded(fakePrisma([...ALL_PERMISSION_KEYS]))
    expect(result).toMatchObject({ ran: false, reason: 'already-seeded' })
  })

  it('reconciles when a catalogue permission is missing from the database, and actually writes it', async () => {
    // Exactly the billing:read situation: seeded workspace, one new key.
    // A recording permission.upsert proves the fullSeed=false reconcile path
    // does what its name says, not merely that it got past the short-circuit
    // (the old assertion — `reason === 'failed'` — passes identically whether
    // fullSeed was computed correctly, computed backwards, or an unrelated
    // bug threw before the upsert loop ever ran).
    const missingKey = 'billing:read'
    const short = ALL_PERMISSION_KEYS.filter((k) => k !== missingKey)
    const upsertedKeys: string[] = []
    const prisma = {
      permission: {
        findMany: vi.fn(async () => short.map((key) => ({ key }))),
        upsert: vi.fn(async ({ where }: any) => { upsertedKeys.push(where.key); return {} }),
      },
      role: {
        count: vi.fn(async () => 5),
        // Throws past this point (role.upsert is not implemented), which is
        // fine — the permission loop runs to completion before roles do, so
        // the missing key is written before the fake fails the rest of seedRbac.
      },
    } as any

    const result = await ensureRbacSeeded(prisma)
    expect(result.reason).toBe('failed')   // it tried to seed, rather than returning 'already-seeded'
    expect(upsertedKeys).toContain(missingKey)
  })

  it('treats roleCount === 0 as an unfinished first seed, not catalogue drift — fullSeed runs even though permissions are already present', async () => {
    // Reproduces the exact lockout scenario: a first seed died between the
    // permission loop and the role loop, so permissions are all present but
    // no role exists yet. The boot-time short-circuit correctly does NOT
    // treat this as already-seeded (roleCount > 0 fails), but computing
    // `fullSeed` from `known.size === 0` alone would then read "permissions
    // exist" and silently downgrade this retry to a drift reconcile — roles
    // get created, but member→role mapping, owner election and the
    // preference backfill never run, leaving every member's roleId null
    // forever. Assert on an observable effect of the full path rather than a
    // fullSeed flag that doesn't exist on the return value: that member
    // mapping (the roleId: null lookup) was attempted at all.
    let memberMappingAttempted = false
    const roles = new Map<string, { id: string; key: string }>()
    let roleSeq = 0

    const prisma = {
      permission: {
        findMany: vi.fn(async () => [...ALL_PERMISSION_KEYS].map((key) => ({ key }))),
        upsert: vi.fn(async () => ({})),
      },
      role: {
        count: vi.fn(async () => 0),
        upsert: vi.fn(async ({ where }: any) => {
          let r = roles.get(where.key)
          if (!r) { r = { id: `role_${++roleSeq}`, key: where.key }; roles.set(where.key, r) }
          return r
        }),
        findMany: vi.fn(async () => Array.from(roles.values())),
      },
      rolePermission: {
        deleteMany: vi.fn(async () => {}),
        upsert: vi.fn(async () => {}),
      },
      member: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.roleId === null) memberMappingAttempted = true
          return []
        }),
      },
      organization: { findMany: vi.fn(async () => []) },
    } as any

    const result = await ensureRbacSeeded(prisma)
    expect(result.reason).toBe('seeded')
    expect(result.roles).toBe(SYSTEM_ROLES.length)
    expect(memberMappingAttempted).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import {
  can, canAll, canAny, effectivePermissions, isActive,
  canAssignRole, assignableRoles, wouldOrphanWorkspace,
  type RbacSubject, type ResolvedRole, type ResolvedOverride,
} from './resolve'

// Every authorization decision in the module runs through this file, so it is
// tested against the rule as written rather than against the implementation:
// deny beats grant, expiry means absent, and rank is strict.

const NOW = new Date('2026-08-24T12:00:00.000Z')
const PAST = new Date('2026-08-01T00:00:00.000Z')
const FUTURE = new Date('2026-12-01T00:00:00.000Z')

const role = (over: Partial<ResolvedRole> = {}): ResolvedRole => ({
  id: 'r-member', key: 'member', name: 'Member', rank: 30,
  permissions: ['users:read', 'projects:read'],
  ...over,
})

const OWNER = role({ id: 'r-owner', key: 'owner', name: 'Owner', rank: 0, permissions: ['users:read', 'users:update', 'roles:assign', 'billing:manage'] })
const ADMIN = role({ id: 'r-admin', key: 'admin', name: 'Admin', rank: 10, permissions: ['users:read', 'users:update', 'roles:assign'] })
const MANAGER = role({ id: 'r-manager', key: 'manager', name: 'Manager', rank: 20, permissions: ['users:read', 'roles:assign'] })
const GUEST = role({ id: 'r-guest', key: 'guest', name: 'Guest', rank: 40, permissions: ['projects:read'] })

const subject = (over: Partial<RbacSubject> = {}): RbacSubject => ({
  id: 'u-1', email: 'u1@example.com', lifecycleStatus: 'active',
  role: role(), overrides: [], ...over,
})

const grant = (key: string, expiresAt: Date | null = null): ResolvedOverride =>
  ({ permissionKey: key, effect: 'grant', expiresAt, reason: 'covering leave' })
const deny = (key: string, expiresAt: Date | null = null): ResolvedOverride =>
  ({ permissionKey: key, effect: 'deny', expiresAt, reason: 'under review' })

describe('can', () => {
  it('grants what the role grants', () => {
    expect(can(subject(), 'users:read', NOW)).toBe(true)
  })

  it('refuses what the role does not grant', () => {
    expect(can(subject(), 'users:deactivate', NOW)).toBe(false)
  })

  it('grants via an override the role does not carry', () => {
    expect(can(subject({ overrides: [grant('users:update')] }), 'users:update', NOW)).toBe(true)
  })

  it('DENY BEATS THE ROLE GRANT', () => {
    // The central rule. A role that grants it plus a deny override is a no.
    expect(can(subject({ overrides: [deny('users:read')] }), 'users:read', NOW)).toBe(false)
  })

  it('DENY BEATS A GRANT OVERRIDE ON THE SAME KEY', () => {
    // Both present is a contradiction; the safer reading wins until an admin
    // resolves it.
    const s = subject({ overrides: [grant('users:update'), deny('users:update')] })
    expect(can(s, 'users:update', NOW)).toBe(false)
  })

  it('ignores an expired deny', () => {
    const s = subject({ overrides: [deny('users:read', PAST)] })
    expect(can(s, 'users:read', NOW)).toBe(true)
  })

  it('ignores an expired grant', () => {
    const s = subject({ overrides: [grant('users:update', PAST)] })
    expect(can(s, 'users:update', NOW)).toBe(false)
  })

  it('honours an override that has not expired yet', () => {
    expect(can(subject({ overrides: [grant('users:update', FUTURE)] }), 'users:update', NOW)).toBe(true)
    expect(can(subject({ overrides: [deny('users:read', FUTURE)] }), 'users:read', NOW)).toBe(false)
  })

  it('treats expiry as exclusive at the exact instant', () => {
    const s = subject({ overrides: [grant('users:update', NOW)] })
    expect(can(s, 'users:update', NOW)).toBe(false)
  })

  for (const status of ['invited', 'suspended', 'deactivated'] as const) {
    it(`gives a ${status} account nothing, whatever its role says`, () => {
      // A suspended member can still hold a live cookie for a few seconds.
      const s = subject({ lifecycleStatus: status, role: OWNER, overrides: [grant('billing:manage')] })
      expect(can(s, 'users:read', NOW)).toBe(false)
      expect(can(s, 'billing:manage', NOW)).toBe(false)
      expect(effectivePermissions(s, NOW)).toEqual([])
    })
  }

  it('gives a member with no role nothing', () => {
    expect(can(subject({ role: null }), 'users:read', NOW)).toBe(false)
  })

  it('still honours a grant override for someone with no role', () => {
    const s = subject({ role: null, overrides: [grant('audit:read')] })
    expect(can(s, 'audit:read', NOW)).toBe(true)
  })
})

describe('canAll / canAny', () => {
  it('canAll requires every permission', () => {
    const s = subject()
    expect(canAll(s, ['users:read', 'projects:read'], NOW)).toBe(true)
    expect(canAll(s, ['users:read', 'billing:manage'], NOW)).toBe(false)
  })

  it('canAny requires one', () => {
    const s = subject()
    expect(canAny(s, ['billing:manage', 'projects:read'], NOW)).toBe(true)
    expect(canAny(s, ['billing:manage', 'audit:read'], NOW)).toBe(false)
  })

  it('canAll over an empty list is vacuously true', () => {
    expect(canAll(subject(), [], NOW)).toBe(true)
  })
})

describe('effectivePermissions', () => {
  it('labels where each permission came from', () => {
    const s = subject({ overrides: [grant('audit:read')] })
    const list = effectivePermissions(s, NOW)
    expect(list.find((p) => p.key === 'users:read')?.source).toBe('role')
    expect(list.find((p) => p.key === 'audit:read')?.source).toBe('override')
  })

  it('carries the override reason through, for the hover explanation', () => {
    const s = subject({ overrides: [grant('audit:read')] })
    expect(effectivePermissions(s, NOW).find((p) => p.key === 'audit:read')?.reason).toBe('covering leave')
  })

  it('omits a denied permission entirely rather than listing it as blocked', () => {
    const s = subject({ overrides: [deny('users:read')] })
    expect(effectivePermissions(s, NOW).map((p) => p.key)).not.toContain('users:read')
  })

  it('does not duplicate a key granted by both role and override', () => {
    const s = subject({ overrides: [grant('users:read')] })
    expect(effectivePermissions(s, NOW).filter((p) => p.key === 'users:read')).toHaveLength(1)
  })

  it('is sorted, so two identical inputs render identically', () => {
    const s = subject({ role: OWNER })
    const keys = effectivePermissions(s, NOW).map((p) => p.key)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('canAssignRole', () => {
  const owner = subject({ id: 'u-owner', role: OWNER })
  const admin = subject({ id: 'u-admin', role: ADMIN })
  const manager = subject({ id: 'u-manager', role: MANAGER })
  const target = { id: 'u-target' }

  it('lets an owner grant admin', () => {
    expect(canAssignRole(owner, target, ADMIN).allowed).toBe(true)
  })

  it('MANAGER CANNOT ASSIGN ADMIN OR OWNER', () => {
    expect(canAssignRole(manager, target, ADMIN).allowed).toBe(false)
    expect(canAssignRole(manager, target, OWNER).allowed).toBe(false)
  })

  it('refuses a role equal to the actor’s own rank', () => {
    // Otherwise any admin could mint unlimited admins.
    const d = canAssignRole(admin, target, ADMIN)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.code).toBe('FORBIDDEN')
  })

  it('lets an admin grant a strictly weaker role', () => {
    expect(canAssignRole(admin, target, MANAGER).allowed).toBe(true)
    expect(canAssignRole(admin, target, GUEST).allowed).toBe(true)
  })

  it('refuses self-assignment outright, even for an owner', () => {
    const d = canAssignRole(owner, { id: owner.id }, GUEST)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.code).toBe('SELF_MODIFICATION_BLOCKED')
  })

  it('refuses anyone without roles:assign', () => {
    const plain = subject({ id: 'u-plain', role: role() })
    expect(canAssignRole(plain, target, GUEST).allowed).toBe(false)
  })

  it('refuses someone whose own role is missing', () => {
    const roleless = subject({ id: 'u-x', role: null, overrides: [grant('roles:assign')] })
    expect(canAssignRole(roleless, target, GUEST).allowed).toBe(false)
  })

  it('explains the refusal in terms the admin can act on', () => {
    const d = canAssignRole(manager, target, OWNER)
    if (!d.allowed) expect(d.message).toMatch(/at or above your own/i)
  })
})

describe('assignableRoles', () => {
  const all = [OWNER, ADMIN, MANAGER, role(), GUEST]

  it('offers an admin only the roles below them', () => {
    expect(assignableRoles(subject({ role: ADMIN }), all).map((r) => r.key)).toEqual(['manager', 'member', 'guest'])
  })

  it('never offers an owner seat to an admin', () => {
    expect(assignableRoles(subject({ role: ADMIN }), all).map((r) => r.key)).not.toContain('owner')
  })

  it('offers nothing to someone without roles:assign', () => {
    expect(assignableRoles(subject({ role: GUEST }), all)).toEqual([])
  })

  it('returns them strongest first, matching the picker order', () => {
    const ranks = assignableRoles(subject({ role: OWNER }), all).map((r) => r.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})

describe('wouldOrphanWorkspace', () => {
  it('blocks demoting the last active owner', () => {
    expect(wouldOrphanWorkspace({ activeOwnerCount: 1, targetIsActiveOwner: true, changeRemovesOwner: true })).toBe(true)
  })

  it('allows it when another owner remains', () => {
    expect(wouldOrphanWorkspace({ activeOwnerCount: 2, targetIsActiveOwner: true, changeRemovesOwner: true })).toBe(false)
  })

  it('ignores changes to people who are not owners', () => {
    expect(wouldOrphanWorkspace({ activeOwnerCount: 1, targetIsActiveOwner: false, changeRemovesOwner: true })).toBe(false)
  })

  it('allows an edit to the last owner that does not remove their ownership', () => {
    // Renaming the last owner is fine; demoting them is not.
    expect(wouldOrphanWorkspace({ activeOwnerCount: 1, targetIsActiveOwner: true, changeRemovesOwner: false })).toBe(false)
  })

  it('blocks when the count has somehow already reached zero', () => {
    expect(wouldOrphanWorkspace({ activeOwnerCount: 0, targetIsActiveOwner: true, changeRemovesOwner: true })).toBe(true)
  })
})

describe('isActive', () => {
  it('is true only for active', () => {
    expect(isActive({ lifecycleStatus: 'active' })).toBe(true)
    for (const s of ['invited', 'suspended', 'deactivated', 'nonsense']) {
      expect(isActive({ lifecycleStatus: s })).toBe(false)
    }
  })
})

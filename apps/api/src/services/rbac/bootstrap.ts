import type { PrismaClient } from '@prisma/client'
import {
  PERMISSION_GROUPS, SYSTEM_ROLES, LEGACY_ROLE_TO_KEY, ALL_PERMISSION_KEYS,
} from '@nexus/shared'

// ─── RBAC bootstrap ──────────────────────────────────────────
// The permission catalogue is data the application cannot function without.
// Every guard fails closed, so an empty `Permission` table is not a degraded
// workspace — it is a workspace where nobody can read the directory, open
// Settings' admin sections, or be assigned a role. Correct behaviour from the
// guard's point of view, total outage from the user's.
//
// It shipped as a seed script that nothing ran. `post-merge.sh` installs,
// generates and pushes the schema; it never seeded. So production got the
// tables and none of the rows, and both modules answered 403 to everything.
//
// This runs on boot and fixes that without anyone remembering a step. It is
// deliberately narrow: it does nothing at all once the catalogue exists, so
// the steady-state cost is one COUNT per process start.

export interface BootstrapResult {
  ran: boolean
  reason: 'already-seeded' | 'seeded' | 'failed'
  permissions?: number
  roles?: number
  membersMapped?: number
  ownerAssigned?: string
  error?: string
}

/**
 * Ensure the catalogue and the five built-in roles exist.
 *
 * Never throws. A workspace that cannot bootstrap is a serious problem, but
 * taking the API process down with it turns "the People page is empty" into
 * "Nexus is offline", which is strictly worse.
 */
export async function ensureRbacSeeded(prisma: PrismaClient): Promise<BootstrapResult> {
  try {
    // The catalogue is the marker. Roles without permissions would be a
    // half-finished seed, so both are checked — and "checked" means "is it
    // current", not just "is it non-empty".
    const [existingKeys, roleCount] = await Promise.all([
      prisma.permission.findMany({ select: { key: true } }),
      prisma.role.count(),
    ])
    const known = new Set(existingKeys.map((p) => p.key))
    const missing = ALL_PERMISSION_KEYS.filter((k) => !known.has(k))

    // Current AND complete. Asking only "is it empty?" meant a permission added
    // to the catalogue after the first boot never reached an existing
    // workspace — every route guarding on it answered 403 to everyone,
    // including the owner, and the only symptom was a feature that silently
    // did not exist.
    if (known.size > 0 && roleCount > 0 && missing.length === 0) {
      return { ran: false, reason: 'already-seeded', permissions: known.size, roles: roleCount }
    }

    console.log(
      known.size === 0
        ? '[rbac] catalogue is empty — seeding roles and permissions'
        : `[rbac] catalogue is missing ${missing.length} permission(s) (${missing.join(', ')}) — reconciling`,
    )
    const result = await seedRbac(prisma)
    console.log(
      `[rbac] seeded ${result.permissions} permissions, ${result.roles} roles` +
      (result.membersMapped ? `, mapped ${result.membersMapped} members` : '') +
      (result.ownerAssigned ? `, owner → ${result.ownerAssigned}` : ''),
    )
    return { ran: true, reason: 'seeded', ...result }
  } catch (err) {
    // The most likely cause is that `prisma db push` has not run, so the tables
    // do not exist yet. Say so plainly rather than leaving a stack trace for
    // someone to interpret at 2am.
    console.error(
      '[rbac] could not bootstrap the permission catalogue. ' +
      'If the tables are missing, run `pnpm db:push` then `pnpm db:seed:rbac`.',
      err,
    )
    return { ran: false, reason: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Bring existing addresses onto the normalised form.
 *
 * `Member.email` is `@unique` and Postgres compares byte-for-byte, so case
 * insensitivity depends entirely on every row being stored lowercased. Rows
 * written before that rule existed are not, and until they are, the same person
 * can hold two accounts.
 *
 * Refuses to act when lowercasing would collide. Two accounts differing only by
 * case is a real situation with real data on both sides, and picking a winner
 * automatically is not a decision a boot sequence should make.
 */
export async function ensureEmailsNormalised(prisma: PrismaClient): Promise<{
  normalised: number
  collisions: string[]
}> {
  try {
    const mixed = await prisma.$queryRaw<{ id: string; email: string }[]>`
      SELECT id, email FROM "Member" WHERE email <> lower(email)
    `
    if (mixed.length === 0) return { normalised: 0, collisions: [] }

    const collisions: string[] = []
    let normalised = 0

    for (const row of mixed) {
      const lower = row.email.toLowerCase()
      const clash = await prisma.member.findFirst({
        where: { email: lower, NOT: { id: row.id } },
        select: { id: true },
      })
      if (clash) {
        collisions.push(row.email)
        continue
      }
      await prisma.member.update({ where: { id: row.id }, data: { email: lower } })
      normalised++
    }

    if (normalised) console.log(`[email] normalised ${normalised} addresses to lowercase`)
    if (collisions.length) {
      console.warn(
        `[email] ${collisions.length} address(es) could not be normalised because a lowercase ` +
        `account already exists: ${collisions.join(', ')}. Merge them by hand — picking a winner ` +
        `automatically would silently drop one person's history.`,
      )
    }
    return { normalised, collisions }
  } catch (err) {
    console.error('[email] could not normalise addresses:', err)
    return { normalised: 0, collisions: [] }
  }
}

/**
 * Idempotent. Every row is upserted on a stable key, so re-running reconciles
 * rather than duplicating, and a permission removed from a system role here is
 * actually revoked rather than lingering from an earlier run.
 */
export async function seedRbac(prisma: PrismaClient): Promise<{
  permissions: number
  roles: number
  membersMapped: number
  ownerAssigned?: string
}> {
  let order = 0
  let permissions = 0
  for (const group of PERMISSION_GROUPS) {
    for (const item of group.items) {
      const [resource, action] = item.key.split(':')
      const data = {
        resource: resource!, action: action!,
        label: item.label, description: item.description ?? null, sortOrder: order++,
      }
      await prisma.permission.upsert({
        where: { key: item.key },
        create: { key: item.key, ...data },
        update: data,
      })
      permissions++
    }
  }

  for (const spec of SYSTEM_ROLES) {
    const shape = {
      name: spec.name, description: spec.description,
      rank: spec.rank, isSystem: true, legacyRole: spec.legacyRole,
    }
    const role = await prisma.role.upsert({
      where: { key: spec.key },
      create: { key: spec.key, ...shape },
      update: shape,
    })

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionKey: { notIn: spec.permissions } },
    })
    for (const key of spec.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey: key } },
        create: { roleId: role.id, permissionKey: key },
        update: {},
      })
    }
  }

  const roles = await prisma.role.findMany()
  const byKey = new Map(roles.map((r) => [r.key, r]))

  // ── Map existing members onto roles ──
  // `roleId` only. `Member.role` is what policy.ts and the task/report routes
  // still read, and rewriting it here would change people's access as a side
  // effect of a bootstrap.
  const unmapped = await prisma.member.findMany({
    where: { roleId: null },
    select: { id: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of unmapped) {
    const key = LEGACY_ROLE_TO_KEY[m.role] ?? 'member'
    await prisma.member.update({ where: { id: m.id }, data: { roleId: byKey.get(key)!.id } })
  }

  // ── Guarantee an Owner ──
  // The last-owner guard protects nobody if there is no owner. The longest-
  // standing org admin takes the seat; failing that, the oldest member, because
  // a workspace nobody can administer cannot be recovered from inside the app.
  const ownerRole = byKey.get('owner')!
  let ownerAssigned: string | undefined
  const owners = await prisma.member.count({
    where: { roleId: ownerRole.id, lifecycleStatus: 'active' },
  })
  if (owners === 0) {
    const candidate =
      (await prisma.member.findFirst({
        where: { role: { in: ['ADMIN', 'OPS_MANAGER'] } },
        orderBy: { createdAt: 'asc' },
      })) ?? (await prisma.member.findFirst({ orderBy: { createdAt: 'asc' } }))
    if (candidate) {
      await prisma.member.update({ where: { id: candidate.id }, data: { roleId: ownerRole.id } })
      ownerAssigned = candidate.email
    }
  }

  // ── Preferences for anyone without them ──
  const missing = await prisma.member.findMany({ where: { preference: null }, select: { id: true } })
  for (const m of missing) {
    await prisma.userPreference.create({ data: { memberId: m.id } })
  }

  return { permissions, roles: SYSTEM_ROLES.length, membersMapped: unmapped.length, ownerAssigned }
}

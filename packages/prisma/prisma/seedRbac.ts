import { PrismaClient } from '@prisma/client'
import { PERMISSION_GROUPS, SYSTEM_ROLES, LEGACY_ROLE_TO_KEY } from '@nexus/shared'

// ─── RBAC seed (CLI) ─────────────────────────────────────────
// `pnpm db:seed:rbac`.
//
// The API also seeds this on boot when the catalogue is empty, so this script
// is for the cases where that is not enough: reconciling after the built-in
// roles change, or repairing a workspace without restarting it. Both paths run
// the same logic over the same catalogue, which is why the catalogue lives in
// @nexus/shared rather than here.
//
// Idempotent. Every row is upserted on a stable key.

const prisma = new PrismaClient()

async function main() {
  let order = 0
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
    }
  }
  console.log(`  ${order} permissions`)

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

    // Replace the grant set, so a permission removed from a system role in the
    // catalogue is actually revoked rather than lingering from an earlier run.
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
    console.log(`  role ${spec.key.padEnd(8)} rank ${String(spec.rank).padStart(2)}  ${spec.permissions.length} permissions  → legacy ${spec.legacyRole}`)
  }

  const roles = await prisma.role.findMany()
  const byKey = new Map(roles.map((r) => [r.key, r]))

  // roleId only. `Member.role` is left exactly as it was: it is what policy.ts
  // and the task/report routes still read.
  const unmapped = await prisma.member.findMany({
    where: { roleId: null },
    select: { id: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of unmapped) {
    const key = LEGACY_ROLE_TO_KEY[m.role] ?? 'member'
    await prisma.member.update({ where: { id: m.id }, data: { roleId: byKey.get(key)!.id } })
  }
  if (unmapped.length) console.log(`  mapped ${unmapped.length} existing members onto roles (Member.role untouched)`)

  const ownerRole = byKey.get('owner')!
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
      console.log(`  owner → ${candidate.email} (longest-standing admin)`)
    } else {
      console.warn('  no members exist — no Owner assigned')
    }
  }

  const missing = await prisma.member.findMany({ where: { preference: null }, select: { id: true } })
  for (const m of missing) {
    await prisma.userPreference.create({ data: { memberId: m.id } })
  }
  if (missing.length) console.log(`  created preferences for ${missing.length} members`)

  console.log('\nRBAC seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

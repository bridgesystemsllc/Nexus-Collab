import type { PrismaClient } from '@prisma/client'
import type { RbacSubject, ResolvedRole } from './resolve'

// ─── Loading a subject ───────────────────────────────────────
// The database side of resolve.ts. Kept separate so the resolution rules stay
// testable as pure functions and this file is only ever about fetching.

/** One query. A guard runs on every request, so it cannot fan out. */
export async function loadSubject(
  prisma: PrismaClient,
  memberId: string,
): Promise<RbacSubject | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      email: true,
      lifecycleStatus: true,
      roleRef: {
        select: {
          id: true, key: true, name: true, rank: true,
          permissions: { select: { permissionKey: true } },
        },
      },
      permissionOverrides: {
        select: { permissionKey: true, effect: true, expiresAt: true, reason: true },
      },
    },
  })
  if (!member) return null

  const role: ResolvedRole | null = member.roleRef
    ? {
        id: member.roleRef.id,
        key: member.roleRef.key,
        name: member.roleRef.name,
        rank: member.roleRef.rank,
        permissions: member.roleRef.permissions.map((p) => p.permissionKey),
      }
    : null

  return {
    id: member.id,
    email: member.email,
    lifecycleStatus: member.lifecycleStatus,
    role,
    overrides: member.permissionOverrides.map((o) => ({
      permissionKey: o.permissionKey,
      effect: o.effect as 'grant' | 'deny',
      expiresAt: o.expiresAt,
      reason: o.reason,
    })),
  }
}

/**
 * The legacy string to write to `Member.role` when a role is assigned.
 *
 * `Member.role` is still what the projects module reads — policy.ts's
 * isOrgAdmin and eighteen other sites. Assigning a role has to keep it in
 * step, or someone's project access would silently diverge from the role
 * their profile displays.
 */
export async function legacyRoleFor(prisma: PrismaClient, roleId: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { legacyRole: true } })
  // Falling back to MEMBER rather than throwing: the weakest legacy value is
  // the safe answer if a custom role were ever created without one.
  return role?.legacyRole ?? 'MEMBER'
}

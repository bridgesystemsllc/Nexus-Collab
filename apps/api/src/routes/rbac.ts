import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import {
  attachSubject, requirePermission, sendError, type RbacRequest,
} from '../middleware/requirePermission'
import { effectivePermissions, assignableRoles } from '../services/rbac/resolve'

// ─── Roles and permissions (read) ────────────────────────────
// The read half of §4's roles/permissions surface. Enough for the invite
// drawer's permission preview and the profile's Permissions tab, which are the
// two places an admin actually reasons about authority.

export const rbacRoutes: ReturnType<typeof Router> = Router()

/** Who am I and what may I do — the client's source of truth for gating UI. */
rbacRoutes.get('/me', attachSubject, async (req: RbacRequest, res: Response) => {
  const subject = req.subject!
  const permissions = effectivePermissions(subject)

  const roles = await prisma.role.findMany({
    select: { id: true, key: true, name: true, description: true, rank: true },
    orderBy: { rank: 'asc' },
  })

  return res.json({
    data: {
      id: subject.id,
      email: subject.email,
      lifecycleStatus: subject.lifecycleStatus,
      role: subject.role
        ? { id: subject.role.id, key: subject.role.key, name: subject.role.name, rank: subject.role.rank }
        : null,
      permissions,
      /// What this actor may hand out. The picker renders exactly this, so it
      /// cannot offer a role the server would refuse.
      assignableRoles: assignableRoles(subject, roles),
    },
  })
})

/** The permission catalogue, grouped for the role editor's checkbox columns. */
rbacRoutes.get('/permissions', requirePermission('roles:read'), async (_req, res: Response) => {
  const permissions = await prisma.permission.findMany({ orderBy: { sortOrder: 'asc' } })

  const groups = new Map<string, typeof permissions>()
  for (const p of permissions) {
    const list = groups.get(p.resource)
    if (list) list.push(p)
    else groups.set(p.resource, [p])
  }

  return res.json({
    data: [...groups.entries()].map(([resource, items]) => ({
      resource,
      permissions: items.map((p) => ({
        key: p.key, action: p.action, label: p.label, description: p.description,
      })),
    })),
  })
})

/** Roles with how many people hold each — the Access section's table. */
rbacRoutes.get('/roles', requirePermission('roles:read'), async (req: RbacRequest, res: Response) => {
  const roles = await prisma.role.findMany({
    orderBy: { rank: 'asc' },
    include: {
      permissions: { select: { permissionKey: true } },
      // Counted, not listed: a role held by two hundred people should not
      // return two hundred rows to render one number.
      _count: { select: { members: true } },
    },
  })

  const assignable = new Set(assignableRoles(req.subject!, roles).map((r) => r.id))

  return res.json({
    data: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      rank: r.rank,
      isSystem: r.isSystem,
      memberCount: r._count.members,
      permissionKeys: r.permissions.map((p) => p.permissionKey),
      /// So the UI can grey out what this actor may not grant, rather than
      /// offering it and surfacing a 403 on save.
      assignableByMe: assignable.has(r.id),
    })),
  })
})

/** One role's full permission set — what the preview panel reads on select. */
rbacRoutes.get('/roles/:id', requirePermission('roles:read'), async (req: RbacRequest, res: Response) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id as string },
    include: { permissions: { include: { permission: true } } },
  })
  if (!role) return sendError(res, 'NOT_FOUND', 'That role does not exist.')

  const groups = new Map<string, { key: string; label: string; description: string | null }[]>()
  for (const rp of role.permissions) {
    const p = rp.permission
    const list = groups.get(p.resource)
    const entry = { key: p.key, label: p.label, description: p.description }
    if (list) list.push(entry)
    else groups.set(p.resource, [entry])
  }

  return res.json({
    data: {
      id: role.id, key: role.key, name: role.name, description: role.description,
      rank: role.rank, isSystem: role.isSystem,
      permissionsByResource: [...groups.entries()].map(([resource, permissions]) => ({ resource, permissions })),
    },
  })
})

export default rbacRoutes

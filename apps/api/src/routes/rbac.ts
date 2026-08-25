import { Router, Response } from 'express'
import { z } from 'zod'
import { createRoleSchema, updateRoleSchema, fieldErrors } from '@nexus/shared'
import { prisma } from '../lib/prisma'
import {
  attachSubject, requirePermission, sendError, requestIdOf,
  type RbacRequest, type ErrorCode,
} from '../middleware/requirePermission'
import {
  effectivePermissions, assignableRoles, canEditRole, ungrantablePermissions,
} from '../services/rbac/resolve'
import { append } from '../services/users/auditService'

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

// ─── Roles (write) ───────────────────────────────────────────
// Custom roles only. The five built-in roles are the fixed points the rank
// rule is expressed in terms of; letting someone edit `owner` would make the
// whole hierarchy editable from inside itself.

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown, res: Response): z.infer<T> | null {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  sendError(res, 'VALIDATION_FAILED', 'One or more fields are invalid.', {
    fields: fieldErrors(result.error),
  })
  return null
}

const auditMetaOf = (req: RbacRequest) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
  requestId: requestIdOf(req),
})

/** Clone an existing role into a new, editable one. */
rbacRoutes.post('/roles', requirePermission('roles:manage'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(createRoleSchema, req.body, res)
    if (!body) return res

    const source = await prisma.role.findUnique({
      where: { id: body.clonedFromRoleId },
      include: { permissions: { select: { permissionKey: true } } },
    })
    if (!source) {
      return sendError(res, 'VALIDATION_FAILED', 'That role does not exist.', {
        fields: { clonedFromRoleId: 'Unknown role.' },
      })
    }

    // A new role must sit strictly below the actor, exactly as an assignment
    // would. Cloning Owner into "Owner (copy)" is the obvious way around the
    // rank rule if this is not checked.
    const actorRank = req.subject!.role?.rank
    if (actorRank === undefined || actorRank === null) {
      return sendError(res, 'FORBIDDEN', 'You have no role, so you cannot create one.')
    }
    const rank = Math.max(source.rank, actorRank + 1)

    const sourceKeys = source.permissions.map((p) => p.permissionKey)
    const ungrantable = ungrantablePermissions(req.subject!, [], sourceKeys)
    if (ungrantable.length > 0) {
      return sendError(res, 'FORBIDDEN', 'You cannot create a role holding permissions you do not have yourself.', {
        permissions: ungrantable,
      })
    }

    const key = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`

    const created = await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          key,
          name: body.name,
          description: body.description ?? null,
          rank,
          isSystem: false,
          legacyRole: source.legacyRole,
          permissions: { create: sourceKeys.map((permissionKey) => ({ permissionKey })) },
        },
      })

      await append(tx, {
        actorId: req.subject!.id,
        actorEmailSnapshot: req.subject!.email ?? null,
        action: 'role.created',
        entityType: 'role',
        entityId: role.id,
        changes: {
          name: { from: null, to: role.name },
          clonedFrom: { from: null, to: source.name },
          permissionCount: { from: null, to: sourceKeys.length },
        },
        metadata: auditMetaOf(req),
      })

      return role
    })

    return res.status(201).json({ data: { id: created.id, key: created.key, name: created.name, rank: created.rank } })
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      return sendError(res, 'VALIDATION_FAILED', 'A role with that name already exists.', {
        fields: { name: 'A role with that name already exists.' },
      })
    }
    console.error(`[rbac] ${requestIdOf(req)} create role failed:`, err)
    return sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

rbacRoutes.patch('/roles/:id', requirePermission('roles:manage'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(updateRoleSchema, req.body, res)
    if (!body) return res

    const role = await prisma.role.findUnique({
      where: { id: req.params.id as string },
      include: { permissions: { select: { permissionKey: true } } },
    })
    if (!role) return sendError(res, 'NOT_FOUND', 'That role does not exist.')

    const decision = canEditRole(req.subject!, role)
    if (!decision.allowed) return sendError(res, decision.code as ErrorCode, decision.message)

    const currentKeys = role.permissions.map((p) => p.permissionKey)
    let nextKeys: string[] | null = null

    if (body.permissionKeys) {
      nextKeys = [...new Set(body.permissionKeys)]

      const known = await prisma.permission.findMany({
        where: { key: { in: nextKeys } },
        select: { key: true },
      })
      if (known.length !== nextKeys.length) {
        const knownSet = new Set(known.map((p) => p.key))
        return sendError(res, 'VALIDATION_FAILED', 'One or more permissions do not exist.', {
          unknown: nextKeys.filter((k) => !knownSet.has(k)),
        })
      }

      const ungrantable = ungrantablePermissions(req.subject!, currentKeys, nextKeys)
      if (ungrantable.length > 0) {
        return sendError(res, 'FORBIDDEN', 'You cannot add a permission you do not have yourself.', {
          permissions: ungrantable,
        })
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: role.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        },
      })

      if (nextKeys) {
        // Replace wholesale. Computing a minimal delta would save two
        // statements and add a way for the stored set to end up neither the
        // old one nor the new one.
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
        await tx.rolePermission.createMany({
          data: nextKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        })
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {}
      if (body.name !== undefined && body.name !== role.name) {
        changes.name = { from: role.name, to: body.name }
      }
      if (body.description !== undefined && body.description !== role.description) {
        changes.description = { from: role.description, to: body.description }
      }
      if (nextKeys) {
        const added = nextKeys.filter((k) => !currentKeys.includes(k))
        const removed = currentKeys.filter((k) => !nextKeys!.includes(k))
        // Listed rather than counted: "permissions: 12 → 14" tells a reader
        // nothing about which two, which is the only thing they want to know.
        if (added.length) changes.permissionsAdded = { from: null, to: added.join(', ') }
        if (removed.length) changes.permissionsRemoved = { from: removed.join(', '), to: null }
      }

      if (Object.keys(changes).length > 0) {
        await append(tx, {
          actorId: req.subject!.id,
          actorEmailSnapshot: req.subject!.email ?? null,
          action: 'role.updated',
          entityType: 'role',
          entityId: role.id,
          changes,
          metadata: auditMetaOf(req),
        })
      }
    })

    return res.json({ data: { id: role.id } })
  } catch (err) {
    console.error(`[rbac] ${requestIdOf(req)} update role failed:`, err)
    return sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

rbacRoutes.delete('/roles/:id', requirePermission('roles:manage'), async (req: RbacRequest, res: Response) => {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id as string },
      include: { _count: { select: { members: true, invitations: true } } },
    })
    if (!role) return sendError(res, 'NOT_FOUND', 'That role does not exist.')

    const decision = canEditRole(req.subject!, role)
    if (!decision.allowed) return sendError(res, decision.code as ErrorCode, decision.message)

    // Deleting a role people hold would leave them with no role at all, which
    // resolve.ts reads as no permissions — a silent mass lockout.
    if (role._count.members > 0 || role._count.invitations > 0) {
      return sendError(res, 'VALIDATION_FAILED', 'Move everyone off this role before deleting it.', {
        memberCount: role._count.members,
        invitationCount: role._count.invitations,
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: role.id } })
      await append(tx, {
        actorId: req.subject!.id,
        actorEmailSnapshot: req.subject!.email ?? null,
        action: 'role.deleted',
        entityType: 'role',
        entityId: role.id,
        changes: { name: { from: role.name, to: null } },
        metadata: auditMetaOf(req),
      })
    })

    return res.status(204).send()
  } catch (err) {
    console.error(`[rbac] ${requestIdOf(req)} delete role failed:`, err)
    return sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

export default rbacRoutes

import { Router, Response } from 'express'
import { z } from 'zod'
import {
  inviteUserSchema, updateUserSchema, changeRoleSchema, changeStatusSchema,
  permissionOverrideSchema, userListQuerySchema, fieldErrors,
} from '@nexus/shared'
import { prisma } from '../lib/prisma'
import {
  requirePermission, sendError, requestIdOf, type RbacRequest, type ErrorCode,
} from '../middleware/requirePermission'
import { inviteRateLimit } from '../middleware/rateLimit'
import { effectivePermissions, canAssignRole } from '../services/rbac/resolve'
import { loadSubject } from '../services/rbac/subject'
import * as users from '../services/users/userService'
import { query as queryAudit } from '../services/users/auditService'
import { getActingOrgId } from '../middleware/billingContext'

// ─── User directory and administration ───────────────────────
// Thin. Every rule that could be got wrong lives in userService or resolve.ts;
// these handlers parse, guard, delegate, and shape the response.

export const userRoutes: ReturnType<typeof Router> = Router()

/** Map a service failure onto the envelope. Unknown errors never leak upward. */
function fail(req: RbacRequest, res: Response, err: unknown): Response {
  if (err instanceof users.ServiceError) {
    const { fields, ...extra } = err.extra as { fields?: Record<string, string> }
    return sendError(res, err.code as ErrorCode, err.message, { ...extra, ...(fields ? { fields } : {}) })
  }
  // A unique-index violation that slipped past the advisory check — two
  // simultaneous invites for the same address. The database is the authority,
  // so map its verdict rather than pretending the race did not happen.
  if ((err as { code?: string })?.code === 'P2002') {
    return sendError(res, 'DUPLICATE_EMAIL', 'A user with this email already exists.', {
      fields: { email: 'A user with this email already exists.' },
    })
  }
  console.error(`[users] ${requestIdOf(req)} unhandled:`, err)
  return sendError(res, 'INTERNAL', 'Something went wrong.')
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown, res: Response): z.infer<T> | null {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  sendError(res, 'VALIDATION_FAILED', 'One or more fields are invalid.', {
    fields: fieldErrors(result.error),
  })
  return null
}

const ctxOf = (req: RbacRequest): users.ActorContext => ({
  subject: req.subject!,
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
  requestId: requestIdOf(req),
})

const publicUser = (m: any) => ({
  id: m.id,
  email: m.email,
  name: m.name,
  displayName: m.displayName,
  avatar: m.avatar,
  jobTitle: m.jobTitle,
  phone: m.phone,
  timezone: m.timezone,
  locale: m.locale,
  lifecycleStatus: m.lifecycleStatus,
  presenceStatus: m.status,
  lastLoginAt: m.lastLoginAt,
  deactivatedAt: m.deactivatedAt,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  department: m.department ?? null,
  role: m.roleRef
    ? { id: m.roleRef.id, key: m.roleRef.key, name: m.roleRef.name, rank: m.roleRef.rank }
    : null,
})

// ─── Directory ───────────────────────────────────────────────

userRoutes.get('/', requirePermission('users:read'), async (req: RbacRequest, res: Response) => {
  try {
    const q = parse(userListQuerySchema, req.query, res)
    if (!q) return res

    const where: Record<string, unknown> = {}
    if (q.status) where.lifecycleStatus = q.status
    if (q.roleId) where.roleId = q.roleId
    if (q.departmentId) where.departmentId = q.departmentId
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
        { jobTitle: { contains: q.q, mode: 'insensitive' } },
      ]
    }

    const orderBy =
      q.sort === 'email' ? { email: q.dir }
      : q.sort === 'lastActive' ? { lastLoginAt: q.dir }
      : q.sort === 'created' ? { createdAt: q.dir }
      : q.sort === 'role' ? { roleRef: { rank: q.dir } }
      : { name: q.dir }

    // One count, one page. No per-row follow-up.
    const [total, rows] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.findMany({
        where,
        orderBy: orderBy as never,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          department: { select: { id: true, name: true, color: true } },
          roleRef: { select: { id: true, key: true, name: true, rank: true } },
        },
      }),
    ])

    return res.json({
      data: rows.map(publicUser),
      page: q.page,
      pageSize: q.pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / q.pageSize)),
    })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.post(
  '/invite',
  requirePermission('users:create'),
  inviteRateLimit,
  async (req: RbacRequest, res: Response) => {
    try {
      const body = parse(inviteUserSchema, req.body, res)
      if (!body) return res

      // The rank rule applies to inviting exactly as it does to reassigning —
      // otherwise the invite form is a way around it.
      const role = await prisma.role.findUnique({
        where: { id: body.roleId },
        select: { id: true, key: true, rank: true, name: true },
      })
      if (!role) {
        return sendError(res, 'VALIDATION_FAILED', 'That role does not exist.', {
          fields: { roleId: 'Unknown role.' },
        })
      }
      const decision = canAssignRole(req.subject!, { id: '__new__' }, role)
      if (!decision.allowed) return sendError(res, decision.code as ErrorCode, decision.message)

      const actor = await prisma.member.findUnique({
        where: { id: req.subject!.id },
        select: { orgId: true },
      })

      const result = await users.inviteUser(prisma, ctxOf(req), {
        ...body,
        departmentId: body.departmentId ?? null,
        orgId: actor!.orgId,
      })

      // The raw token leaves the process exactly once, in the email. Email is
      // not configured yet (AGENT_MAILBOX / GRAPH_* unset), so the link is
      // returned to the caller rather than silently lost — an invitation that
      // cannot be delivered and says nothing is worse than one that admits it.
      const acceptUrl = `${process.env.FRONTEND_URL ?? ''}/invite/accept?token=${result.rawToken}`

      return res.status(201).json({
        data: { invitation: result.invitation, resent: result.resent },
        meta: {
          emailConfigured: !!process.env.AGENT_MAILBOX,
          ...(process.env.AGENT_MAILBOX ? {} : { acceptUrl, note: 'Email is not configured — share this link directly.' }),
        },
      })
    } catch (err) {
      return fail(req, res, err)
    }
  },
)

userRoutes.get('/:id', requirePermission('users:read'), async (req: RbacRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, color: true } },
        roleRef: { select: { id: true, key: true, name: true, rank: true } },
      },
    })
    if (!member) return sendError(res, 'NOT_FOUND', 'That user does not exist.')

    const subject = await loadSubject(prisma, id)
    const recent = await queryAudit(prisma, getActingOrgId(req), { entityType: 'user', entityId: id, pageSize: 10 })

    return res.json({
      data: {
        user: publicUser(member),
        // Each entry says whether it came from the role or an override, which
        // is what the Permissions tab annotates.
        effectivePermissions: subject ? effectivePermissions(subject) : [],
        recentActivity: recent.rows,
      },
    })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.patch('/:id', requirePermission('users:update'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(updateUserSchema, req.body, res)
    if (!body) return res
    const { updatedAt, firstName, lastName, ...rest } = body

    // `Member` stores one `name`, the spec edits first and last. Compose only
    // when a name part was actually sent, so a phone-only edit does not
    // rewrite someone's name from stale halves.
    const patch: Record<string, unknown> = { ...rest }
    if (firstName !== undefined || lastName !== undefined) {
      const current = await prisma.member.findUnique({
        where: { id: req.params.id as string },
        select: { name: true },
      })
      const [curFirst = '', ...curRest] = (current?.name ?? '').split(' ')
      patch.name = [firstName ?? curFirst, lastName ?? curRest.join(' ')].filter(Boolean).join(' ').trim()
    }

    const result = await users.updateUser(prisma, ctxOf(req), req.params.id as string, patch, {
      expectedUpdatedAt: updatedAt,
    })
    return res.json({ data: result })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.patch('/:id/role', requirePermission('roles:assign'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(changeRoleSchema, req.body, res)
    if (!body) return res

    const role = await prisma.role.findUnique({
      where: { id: body.roleId },
      select: { id: true, key: true, rank: true, name: true },
    })
    if (!role) {
      return sendError(res, 'VALIDATION_FAILED', 'That role does not exist.', {
        fields: { roleId: 'Unknown role.' },
      })
    }

    const decision = canAssignRole(req.subject!, { id: req.params.id as string }, role)
    if (!decision.allowed) return sendError(res, decision.code as ErrorCode, decision.message)

    await users.changeRole(prisma, ctxOf(req), req.params.id as string, body.roleId, body.reason)
    return res.json({ data: { id: req.params.id, roleId: body.roleId } })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.patch('/:id/status', requirePermission('users:deactivate'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(changeStatusSchema, req.body, res)
    if (!body) return res
    const result = await users.changeStatus(prisma, ctxOf(req), req.params.id as string, body.status, body.reason)
    return res.json({ data: { id: req.params.id, status: body.status, ...result } })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.post('/:id/permissions', requirePermission('roles:manage'), async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(permissionOverrideSchema, req.body, res)
    if (!body) return res
    await users.setOverride(prisma, ctxOf(req), req.params.id as string, {
      permissionKey: body.permissionKey,
      effect: body.effect,
      reason: body.reason,
      expiresAt: body.expiresAt ?? null,
    })
    return res.status(201).json({ data: { ok: true } })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.delete('/:id/permissions/:permissionKey', requirePermission('roles:manage'), async (req: RbacRequest, res: Response) => {
  try {
    await users.removeOverride(prisma, ctxOf(req), req.params.id as string, req.params.permissionKey as string)
    return res.status(204).send()
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.post('/:id/force-logout', requirePermission('users:deactivate'), async (req: RbacRequest, res: Response) => {
  try {
    const result = await users.forceLogout(prisma, ctxOf(req), req.params.id as string)
    return res.json({ data: result })
  } catch (err) {
    return fail(req, res, err)
  }
})

userRoutes.post(
  '/:id/resend-invite',
  requirePermission('users:create'),
  inviteRateLimit,
  async (req: RbacRequest, res: Response) => {
    try {
      const invitation = await prisma.userInvitation.findFirst({
        where: { id: req.params.id as string },
        include: { role: { select: { id: true } } },
      })
      if (!invitation) return sendError(res, 'NOT_FOUND', 'That invitation does not exist.')
      if (invitation.acceptedAt) {
        return sendError(res, 'VALIDATION_FAILED', 'That invitation has already been accepted.')
      }

      const actor = await prisma.member.findUnique({
        where: { id: req.subject!.id }, select: { orgId: true },
      })

      // Routed through inviteUser so the old token is revoked and a new one
      // issued — a resend that reuses the token is not single-use.
      const result = await users.inviteUser(prisma, ctxOf(req), {
        email: invitation.email,
        firstName: invitation.firstName ?? '',
        lastName: invitation.lastName ?? '',
        roleId: invitation.roleId,
        departmentId: invitation.departmentId,
        orgId: actor!.orgId,
      })

      const acceptUrl = `${process.env.FRONTEND_URL ?? ''}/invite/accept?token=${result.rawToken}`
      return res.json({
        data: { invitation: result.invitation, resent: true },
        meta: process.env.AGENT_MAILBOX ? {} : { acceptUrl, note: 'Email is not configured — share this link directly.' },
      })
    } catch (err) {
      return fail(req, res, err)
    }
  },
)

export default userRoutes

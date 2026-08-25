import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { normaliseEmail, LEGACY_ROLE_TO_KEY } from '@nexus/shared'
import { prisma } from '../index'
import { requirePermission, sendError, type RbacRequest } from '../middleware/requirePermission'
import { can } from '../services/rbac/resolve'
import { append } from '../services/users/auditService'
import { updateMemberSchema } from './members.schema'
import { changeStatus, ServiceError, type ActorContext } from '../services/users/userService'
import { requestIdOf } from '../middleware/requirePermission'

// ─── Legacy member administration ───────────────────────────
// Predates the User Management module. The Dept Manager screen still drives
// these, so they stay — but they were writing to the same table with none of
// its rules.
//
// `PATCH /:id` in particular passed `req.body` to Prisma verbatim. Any signed-in
// user could send `{ roleId: <owner role id> }` and become Owner: no permission
// check, no rank check, no last-owner guard, no audit row. That is every
// guarantee in §6 defeated by one route. Demonstrated against a running server
// before it was fixed, not inferred.
//
// The rule now: this router may edit who someone IS. It may not edit what they
// are ALLOWED TO DO. Authority has its own routes, with their own guards and
// their own audit actions, and nothing here is a way around them.

export const memberRoutes: ReturnType<typeof Router> = Router()

const ctxOf = (req: RbacRequest): ActorContext => ({
  subject: req.subject!,
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
  requestId: requestIdOf(req),
})

// ─── List all members ──────────────────────────────────────
memberRoutes.get('/', requirePermission('users:read'), async (_req: Request, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(members)
  } catch (error) {
    console.error('[members] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

// ─── Create a new member ───────────────────────────────────
const createMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  departmentId: z.string().optional(),
  avatar: z.string().optional(),
})

memberRoutes.post('/', requirePermission('users:create'), async (req: Request, res: Response) => {
  try {
    const data = createMemberSchema.parse(req.body)
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const member = await prisma.member.create({
      data: {
        clerkUserId: `user_${crypto.randomUUID().slice(0, 8)}`,
        orgId: org.id,
        name: data.name,
        email: normaliseEmail(data.email),
        role: data.role,
        departmentId: data.departmentId,
        avatar: data.avatar,
      },
    })
    res.status(201).json(member)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Email already in use' })
    console.error('[members] POST / error:', error)
    res.status(500).json({ error: 'Failed to create member' })
  }
})

// ─── Update a member ───────────────────────────────────────
memberRoutes.patch('/:id', requirePermission('users:update'), async (req: RbacRequest, res: Response) => {
  try {
    const parsed = updateMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      // Naming the rejected keys matters: the Dept Manager screen is old, and
      // "unrecognized key roleId" is the difference between someone fixing
      // their request and someone concluding the API is broken.
      return sendError(res, 'VALIDATION_FAILED', 'That field cannot be changed here.', {
        fields: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message]),
        ),
        hint: 'Role, status and permissions are changed through /users/:id/role, /users/:id/status and /users/:id/permissions, which enforce the rank rule and write an audit entry.',
      })
    }
    const { role, ...rest } = parsed.data
    const id = req.params.id as string

    const before = await prisma.member.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, roleId: true },
    })
    if (!before) return sendError(res, 'NOT_FOUND', 'That member does not exist.')

    const data: Record<string, unknown> = { ...rest }

    if (role !== undefined && role !== before.role) {
      // The legacy string is not decoration: policy.ts reads it, and ADMIN and
      // OPS_MANAGER both pass isOrgAdmin. Changing it IS a privilege change, so
      // it needs the permission that governs privilege changes.
      if (!req.subject || !can(req.subject, 'roles:assign')) {
        return sendError(res, 'FORBIDDEN', 'Changing a role needs the roles:assign permission.', {
          required: 'roles:assign',
        })
      }
      if (id === req.subject.id) {
        return sendError(res, 'SELF_MODIFICATION_BLOCKED', 'You cannot change your own role. Ask another admin.')
      }
      data.role = role

      // Keep the two systems in step. Leaving roleId behind is how someone's
      // profile comes to show one role while their access follows another.
      const key = LEGACY_ROLE_TO_KEY[role] ?? 'member'
      const target = await prisma.role.findUnique({ where: { key }, select: { id: true } })
      if (target) data.roleId = target.id
    }

    const member = await prisma.member.update({
      where: { id },
      data,
      include: { department: { select: { id: true, name: true } } },
    })

    // §6.9: an unaudited authority change is a bug. Profile-only edits are not
    // authority changes and are left out of the trail deliberately — this
    // router is also the presence/avatar path, and logging every status flip
    // would bury the entries that matter.
    if (data.role !== undefined) {
      await append(prisma, {
        actorId: req.subject!.id,
        actorEmailSnapshot: req.subject!.email ?? null,
        action: 'user.role_changed',
        entityType: 'user',
        entityId: id,
        changes: { role: { from: before.role, to: data.role } },
        metadata: { via: 'legacy /members', ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      })
    }

    res.json(member)
  } catch (error) {
    console.error('[members] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update member' })
  }
})

// ─── Delete a member ───────────────────────────────────────
/**
 * Deactivates. Does not delete.
 *
 * This used to be `prisma.member.delete`, against a standing rule that a user
 * is never hard-deleted — their tasks, comments and audit trail all name them,
 * and removing the row either fails on a foreign key or takes that history with
 * it. Deactivation is the operation people actually mean, and it is reversible.
 */
memberRoutes.delete('/:id', requirePermission('users:deactivate'), async (req: RbacRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const result = await changeStatus(
      prisma, ctxOf(req), id, 'deactivated',
      'Removed from the Dept Manager screen',
    )
    res.json({ success: true, deactivated: true, ...result })
  } catch (error) {
    if (error instanceof ServiceError) {
      return sendError(res, error.code as 'LAST_OWNER_PROTECTED', error.message)
    }
    console.error('[members] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to deactivate member' })
  }
})

// ─── Invite a new user ─────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.string().optional(),
  departmentId: z.string().optional(),
})

memberRoutes.post('/invite', requirePermission('users:create'), async (req: Request, res: Response) => {
  try {
    const data = inviteSchema.parse(req.body)
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const inviter = await prisma.member.findFirst({
      where: { role: 'admin' },
    }) || await prisma.member.findFirst()
    // `invitedBy` is required, and an invite nobody sent has no one to chase
    // when it is queried later.
    if (!inviter) return res.status(400).json({ error: 'No member to attribute the invite to' })

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const invite = await prisma.organizationInvite.create({
      data: {
        orgId: org.id,
        invitedEmail: normaliseEmail(data.email),
        role: data.role || 'member',
        token,
        status: 'pending',
        expiresAt,
        invitedBy: inviter.id,
      },
    })

    const member = await prisma.member.create({
      data: {
        clerkUserId: `user_${crypto.randomUUID().slice(0, 8)}`,
        orgId: org.id,
        name: data.email.split('@')[0],
        email: normaliseEmail(data.email),
        role: data.role || 'member',
        status: 'AVAILABLE',
        departmentId: data.departmentId,
      },
    })

    res.status(201).json({ invite, member })
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Email already in use' })
    console.error('[members] POST /invite error:', error)
    res.status(500).json({ error: 'Failed to send invite' })
  }
})

// ─── List all pending invites ──────────────────────────────
memberRoutes.get('/invites', requirePermission('users:read'), async (_req: Request, res: Response) => {
  try {
    const invites = await prisma.organizationInvite.findMany({
      orderBy: { createdAt: 'desc' },
      // `invitedBy` is the foreign key column; `inviter` is the relation.
      include: { inviter: { select: { name: true, email: true } } },
    })
    res.json(invites)
  } catch (error) {
    console.error('[members] GET /invites error:', error)
    res.status(500).json({ error: 'Failed to fetch invites' })
  }
})

// ─── Cancel/revoke an invite ───────────────────────────────
memberRoutes.delete('/invites/:id', requirePermission('users:create'), async (req: Request, res: Response) => {
  try {
    await prisma.organizationInvite.delete({
      where: { id: req.params.id as string },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[members] DELETE /invites/:id error:', error)
    res.status(500).json({ error: 'Failed to revoke invite' })
  }
})

// ─── Assign member to department ───────────────────────────
memberRoutes.post('/:id/assign-department', requirePermission('users:update'), async (req: Request, res: Response) => {
  try {
    const { departmentId } = req.body
    if (!departmentId) return res.status(400).json({ error: 'departmentId is required' })

    const member = await prisma.member.update({
      where: { id: req.params.id as string },
      data: { departmentId },
    })
    res.json(member)
  } catch (error) {
    console.error('[members] POST /:id/assign-department error:', error)
    res.status(500).json({ error: 'Failed to assign department' })
  }
})

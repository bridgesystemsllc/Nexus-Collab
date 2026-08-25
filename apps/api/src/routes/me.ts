import { Router, Response } from 'express'
import { z } from 'zod'
import {
  updateMeSchema, preferencesSchema, notificationPrefsSchema, emailChangeSchema,
  fieldErrors,
} from '@nexus/shared'
import { prisma } from '../lib/prisma'
import {
  attachSubject, sendError, requestIdOf, type RbacRequest, type ErrorCode,
} from '../middleware/requirePermission'
import { emailChangeRateLimit } from '../middleware/rateLimit'
import { effectivePermissions, assignableRoles } from '../services/rbac/resolve'
import { ServiceError, type ActorContext } from '../services/users/userService'
import * as me from '../services/users/meService'

// ─── Self-service settings ───────────────────────────────────
// Everything a signed-in member may change about their own account. No
// permission is required to reach these — they are about you — but nothing
// reachable from here can change what you are allowed to do.
//
// The guarantee is structural: `updateMeSchema` is `.strict()` and has no
// roleId, status or permissions field, so a request carrying one is refused by
// the parser before a handler sees it. There is no `if` to forget.

export const meRoutes: ReturnType<typeof Router> = Router()

meRoutes.use(attachSubject)

function fail(req: RbacRequest, res: Response, err: unknown): Response {
  if (err instanceof ServiceError) {
    const { fields, ...extra } = err.extra as { fields?: Record<string, string> }
    return sendError(res, err.code as ErrorCode, err.message, { ...extra, ...(fields ? { fields } : {}) })
  }
  if ((err as { code?: string })?.code === 'P2002') {
    return sendError(res, 'DUPLICATE_EMAIL', 'That email address is already in use.')
  }
  console.error(`[me] ${requestIdOf(req)} unhandled:`, err)
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

const ctxOf = (req: RbacRequest): ActorContext => ({
  subject: req.subject!,
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
  requestId: requestIdOf(req),
})

// ─── Everything the settings screen needs, in one request ────

meRoutes.get('/', async (req: RbacRequest, res: Response) => {
  try {
    const id = req.subject!.id
    const [member, preference, notifications, roles] = await Promise.all([
      prisma.member.findUnique({
        where: { id },
        include: {
          department: { select: { id: true, name: true, color: true } },
          roleRef: { select: { id: true, key: true, name: true, rank: true } },
        },
      }),
      prisma.userPreference.findUnique({ where: { memberId: id } }),
      prisma.notificationPreference.findMany({ where: { memberId: id } }),
      prisma.role.findMany({ select: { id: true, key: true, name: true, rank: true }, orderBy: { rank: 'asc' } }),
    ])
    if (!member) return sendError(res, 'NOT_FOUND', 'Your account could not be found.')

    const [first = '', ...rest] = member.name.split(' ')

    return res.json({
      data: {
        profile: {
          id: member.id,
          email: member.email,
          firstName: first,
          lastName: rest.join(' '),
          name: member.name,
          displayName: member.displayName,
          avatar: member.avatar,
          jobTitle: member.jobTitle,
          phone: member.phone,
          timezone: member.timezone,
          locale: member.locale,
          lifecycleStatus: member.lifecycleStatus,
          emailVerifiedAt: member.emailVerifiedAt,
          pendingEmail: member.pendingEmail,
          pendingEmailExpiresAt: member.pendingEmailExpiresAt,
          createdAt: member.createdAt,
          lastLoginAt: member.lastLoginAt,
          department: member.department,
          role: member.roleRef,
        },
        // Nulls mean "never touched"; the client renders the same defaults the
        // server would apply, so an untouched account still shows real values.
        preferences: preference,
        notifications: me.buildMatrix(notifications),
        permissions: effectivePermissions(req.subject!),
        assignableRoles: assignableRoles(req.subject!, roles),
      },
    })
  } catch (err) {
    return fail(req, res, err)
  }
})

meRoutes.patch('/', async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(updateMeSchema, req.body, res)
    if (!body) return res

    const { firstName, lastName, ...rest } = body
    const patch: Record<string, unknown> = { ...rest }
    if (firstName !== undefined || lastName !== undefined) {
      const current = await prisma.member.findUnique({
        where: { id: req.subject!.id },
        select: { name: true },
      })
      const [curFirst = '', ...curRest] = (current?.name ?? '').split(' ')
      patch.name = [firstName ?? curFirst, lastName ?? curRest.join(' ')].filter(Boolean).join(' ').trim()
    }

    const result = await me.updateMe(prisma, ctxOf(req), patch)
    return res.json({ data: result })
  } catch (err) {
    return fail(req, res, err)
  }
})

// ─── Preferences ─────────────────────────────────────────────

meRoutes.patch('/preferences', async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(preferencesSchema, req.body, res)
    if (!body) return res
    const saved = await me.updatePreferences(prisma, ctxOf(req), body)
    return res.json({ data: saved })
  } catch (err) {
    return fail(req, res, err)
  }
})

// ─── Notifications ───────────────────────────────────────────

meRoutes.patch('/notifications', async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(notificationPrefsSchema, req.body, res)
    if (!body) return res
    const matrix = await me.updateNotifications(prisma, ctxOf(req), body.entries)
    return res.json({ data: matrix })
  } catch (err) {
    return fail(req, res, err)
  }
})

// ─── Sessions ────────────────────────────────────────────────

meRoutes.get('/sessions', async (req: RbacRequest, res: Response) => {
  try {
    const rows = await me.listSessions(prisma, req.subject!.id, req.sessionID ?? null)
    return res.json({ data: rows })
  } catch (err) {
    return fail(req, res, err)
  }
})

meRoutes.delete('/sessions', async (req: RbacRequest, res: Response) => {
  try {
    const result = await me.signOutOtherSessions(prisma, ctxOf(req), req.sessionID ?? null)
    return res.json({ data: result })
  } catch (err) {
    return fail(req, res, err)
  }
})

// ─── Email change ────────────────────────────────────────────

meRoutes.post('/email-change', emailChangeRateLimit, async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(emailChangeSchema, req.body, res)
    if (!body) return res

    const result = await me.requestEmailChange(prisma, ctxOf(req), body.newEmail)

    // Byte-for-byte identical whether or not the address already belongs to
    // somebody (§6.8). `result.deliverable` is deliberately not consulted
    // here: branching on it — even only to change a note, even only while
    // email is unconfigured — turns this endpoint into an oracle for which
    // addresses have accounts, which a Guest could otherwise not discover.
    //
    // A token for a taken address is real-looking and simply never verifies,
    // and at that point the refusal is indistinguishable from a stale link.
    const meta: Record<string, unknown> = {
      emailConfigured: !!process.env.AGENT_MAILBOX,
      note: 'Check the new address for a confirmation link.',
    }
    if (!process.env.AGENT_MAILBOX) {
      meta.confirmUrl = `${process.env.FRONTEND_URL ?? ''}/settings/confirm-email?token=${result.rawToken}`
      meta.note = 'Email is not configured — open this link to confirm.'
    }

    return res.status(202).json({
      data: { pendingEmail: body.newEmail, requiresConfirmation: true },
      meta,
    })
  } catch (err) {
    return fail(req, res, err)
  }
})

const verifySchema = z.object({ token: z.string().min(1) }).strict()

meRoutes.post('/email-change/verify', emailChangeRateLimit, async (req: RbacRequest, res: Response) => {
  try {
    const body = parse(verifySchema, req.body, res)
    if (!body) return res
    const result = await me.verifyEmailChange(prisma, ctxOf(req), body.token)
    return res.json({ data: result })
  } catch (err) {
    return fail(req, res, err)
  }
})

meRoutes.delete('/email-change', async (req: RbacRequest, res: Response) => {
  try {
    await me.cancelEmailChange(prisma, ctxOf(req))
    return res.status(204).send()
  } catch (err) {
    return fail(req, res, err)
  }
})

export default meRoutes

import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { loadSubject } from '../services/rbac/subject'
import { can, type PermissionKey, type RbacSubject } from '../services/rbac/resolve'

// ─── Permission guard ────────────────────────────────────────
// Every user-management and settings route runs through this. It resolves the
// acting member once per request, caches the subject on the request, and
// answers with the module's error envelope.
//
// It fails closed at every step: no session, no member, an unknown member, a
// suspended one, or a database error all produce a refusal, never a pass.

export const ERROR_CODES = {
  VALIDATION_FAILED: 422,
  DUPLICATE_EMAIL: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  LAST_OWNER_PROTECTED: 409,
  SELF_MODIFICATION_BLOCKED: 403,
  INVITE_EXPIRED: 410,
  STALE_RESOURCE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/** The envelope, used by every route in this module without exception. */
export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  extra: { fields?: Record<string, string>; [k: string]: unknown } = {},
): Response {
  const { fields, ...rest } = extra
  return res.status(ERROR_CODES[code]).json({
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      ...rest,
      requestId: requestIdOf(res.req as Request),
    },
  })
}

/** A stable id per request, echoed in errors and written into audit metadata. */
export function requestIdOf(req: Request): string {
  const r = req as Request & { _requestId?: string }
  if (!r._requestId) r._requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  return r._requestId
}

export interface RbacRequest extends Request {
  /// Set by the guard. Present on every route behind requirePermission.
  subject?: RbacSubject
}

/**
 * Resolve the acting member without asserting anything.
 *
 * Used by routes that are permission-free but still need to know who is
 * calling — /me, for instance, which anyone signed in may read.
 */
export async function attachSubject(
  req: RbacRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.subject) return next()

  const member = (req as any).member as { id: string } | undefined
  if (!member?.id) {
    sendError(res, 'UNAUTHENTICATED', 'Sign in to continue.')
    return
  }

  try {
    const subject = await loadSubject(prisma, member.id)
    if (!subject) {
      // Authenticated against a member row that no longer exists.
      sendError(res, 'UNAUTHENTICATED', 'Your account could not be found. Sign in again.')
      return
    }
    req.subject = subject
    next()
  } catch (err) {
    console.error(`[rbac] could not resolve the acting member:`, err)
    // Fail closed. A database blip must not become an open door.
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
}

/**
 * Require one permission.
 *
 *   router.get('/users', requirePermission('users:read'), handler)
 *
 * A deactivated or suspended member is refused here even with a live session,
 * because resolve.ts gives an inactive subject no permissions at all.
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: RbacRequest, res: Response, next: NextFunction): Promise<void> => {
    await attachSubject(req, res, async () => {
      const subject = req.subject!

      if (subject.lifecycleStatus !== 'active') {
        // Distinguished from a plain 403 so the client can clear its auth state
        // and show a message page rather than a blank login screen.
        res.status(401).json({
          error: {
            code: 'UNAUTHENTICATED',
            message:
              subject.lifecycleStatus === 'deactivated'
                ? 'This account has been deactivated.'
                : 'This account is not active.',
            reason: `account_${subject.lifecycleStatus}`,
            requestId: requestIdOf(req),
          },
        })
        return
      }

      if (!can(subject, permission)) {
        sendError(res, 'FORBIDDEN', 'You do not have permission to do that.', {
          required: permission,
        })
        return
      }

      next()
    })
  }
}

/** Require every listed permission. */
export function requireAllPermissions(...permissions: PermissionKey[]) {
  return async (req: RbacRequest, res: Response, next: NextFunction): Promise<void> => {
    await attachSubject(req, res, async () => {
      const subject = req.subject!
      const missing = permissions.filter((p) => !can(subject, p))
      if (missing.length > 0) {
        sendError(res, 'FORBIDDEN', 'You do not have permission to do that.', { required: missing })
        return
      }
      next()
    })
  }
}

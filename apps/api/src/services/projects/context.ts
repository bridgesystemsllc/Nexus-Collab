import type { Request } from 'express'
import type { PrismaClient } from '@prisma/client'
import type { PolicyActor, PolicyProject } from './policy'

// ─── Request context for project routes ──────────────────────
// Resolves the acting member and loads a project in the exact shape the
// policy function needs. Every mutation route calls loadProjectForPolicy and
// passes the result to can(); nothing reads a department id off the request
// body to decide access.

export class UnauthenticatedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

export class NotFoundError extends Error {
  readonly status = 404
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  readonly status = 422
  readonly details: unknown
  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class ConflictError extends Error {
  readonly status = 409
  readonly details: unknown
  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'ConflictError'
    this.details = details
  }
}

/**
 * The acting member. In non-production a request with no session resolves to
 * the first admin so local development and the dev-login flow work, mirroring
 * the escape hatch the integrations routes already use. In production a
 * missing session is always a 401 — the fallback is explicitly gated.
 */
export async function resolveActor(
  prisma: PrismaClient,
  req: Request,
): Promise<PolicyActor> {
  const member = (req as any).member as
    | { id: string; role: string; orgId: string; departmentId: string | null }
    | undefined

  if (member) {
    return {
      id: member.id,
      role: member.role,
      orgId: member.orgId,
      departmentId: member.departmentId,
    }
  }

  if (process.env.NODE_ENV === 'production') throw new UnauthenticatedError()

  const fallback =
    (await prisma.member.findFirst({ where: { role: 'ADMIN' } })) ??
    (await prisma.member.findFirst())
  if (!fallback) throw new UnauthenticatedError('No members exist in this workspace')

  return {
    id: fallback.id,
    role: fallback.role,
    orgId: fallback.orgId,
    departmentId: fallback.departmentId,
  }
}

/**
 * Load exactly the fields the policy needs — participating departments with
 * their lane leads, and explicit member overrides. Deliberately narrow: the
 * policy must not be able to accidentally depend on data a caller forgot to
 * include, which is how authorization bugs get introduced.
 */
export async function loadProjectForPolicy(
  prisma: PrismaClient,
  projectId: string,
): Promise<PolicyProject | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      orgId: true,
      projectManagerId: true,
      executiveSponsorId: true,
      ownerDepartmentId: true,
      isConfidential: true,
      deletedAt: true,
      departments: { select: { departmentId: true, role: true, laneLeadId: true } },
      members: { select: { memberId: true, role: true, departmentId: true } },
    },
  })
  return project as PolicyProject | null
}

/**
 * Project ids the actor may see, as a Prisma `where` fragment. Used by list
 * endpoints so scoping happens in SQL rather than by loading everything and
 * filtering in memory.
 *
 * Mirrors canView(): org match, not soft-deleted, and either an admin, a named
 * member, a participating department, or the owning department. Confidential
 * projects drop out unless the actor is named on them.
 */
export function visibilityWhere(actor: PolicyActor): Record<string, unknown> {
  const isAdmin = actor.role === 'ADMIN' || actor.role === 'OPS_MANAGER'

  const base: Record<string, unknown> = { orgId: actor.orgId, deletedAt: null }
  if (isAdmin) return base

  const named = { members: { some: { memberId: actor.id } } }
  const managed = {
    OR: [{ projectManagerId: actor.id }, { executiveSponsorId: actor.id }],
  }
  const viaDepartment = actor.departmentId
    ? {
        AND: [
          { isConfidential: false },
          {
            OR: [
              { departments: { some: { departmentId: actor.departmentId } } },
              { ownerDepartmentId: actor.departmentId },
            ],
          },
        ],
      }
    : null

  return {
    ...base,
    OR: [named, managed, ...(viaDepartment ? [viaDepartment] : [])],
  }
}

/** Maps a thrown service error onto an HTTP status and response body. */
export function errorResponse(err: unknown): {
  status: number
  body: { error: { code: string; message: string; details?: unknown } }
} {
  const e = err as { status?: number; name?: string; message?: string; details?: unknown; chain?: unknown }
  const status = typeof e?.status === 'number' ? e.status : 500
  const code = e?.name ?? 'InternalError'
  // A 500 must not leak an internal message to the client, but it must still
  // reach the logs with enough context to find the failure.
  if (status >= 500) {
    console.error('[projects] unhandled error:', err)
    return { status, body: { error: { code: 'InternalError', message: 'Something went wrong' } } }
  }
  return {
    status,
    body: {
      error: {
        code,
        message: e?.message ?? 'Request failed',
        ...(e?.details !== undefined ? { details: e.details } : {}),
        ...(e?.chain !== undefined ? { details: e.chain } : {}),
      },
    },
  }
}

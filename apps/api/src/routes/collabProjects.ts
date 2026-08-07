import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, visibilityWhere, errorResponse,
  NotFoundError, ValidationError,
} from '../services/projects/context'
import {
  linkProject, unlinkProject, buildCollabBoard, resolveCollabDepartments,
  COLLAB_VISIBILITIES, type CollabVisibility,
} from '../services/projects/collabBridge'

// ─── Collab ↔ project bridge ─────────────────────────────────
// Mounted at both /collabs and /cowork: the spec names the former, the existing
// workspace UI is built on the latter, and one router serving both beats two
// copies drifting apart.

export const collabProjectRoutes: ReturnType<typeof Router> = Router()

function ok(res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return res.json({ data, meta })
}
function fail(res: Response, err: unknown) {
  const { status, body } = errorResponse(err)
  return res.status(status).json(body)
}
function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value)
  if (!r.success) throw new ValidationError('Validation failed', r.error.flatten())
  return r.data
}

async function requireSpace(id: string, orgId: string) {
  const space = await prisma.coworkSpace.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, deptNames: true, memberIds: true },
  })
  if (!space) throw new NotFoundError('Collab workspace not found')
  // CoworkSpace has no orgId column; scope is enforced through the projects it
  // links, each of which is checked against the actor's org and visibility.
  void orgId
  return space
}

// ─── Projects in a collab ────────────────────────────────────

collabProjectRoutes.get('/:collabId/projects', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const space = await requireSpace(req.params.collabId as string, actor.orgId)

    const q = parseOrThrow(
      z.object({ includeDetached: z.enum(['true', 'false']).default('false') }),
      req.query,
    )

    const links = await prisma.collabProjectLink.findMany({
      where: {
        coworkSpaceId: space.id,
        ...(q.includeDetached === 'true' ? {} : { unlinkedAt: null }),
        // Scoped in SQL: a member who cannot see a project must not learn it
        // exists from the collab's project list.
        project: { is: visibilityWhere(actor) },
      },
      include: {
        project: {
          select: {
            id: true, projectNumber: true, title: true, status: true, priority: true,
            health: true, healthBand: true, percentComplete: true, targetEndDate: true,
            projectType: { select: { label: true } },
            ownerDepartment: { select: { id: true, name: true, color: true } },
            projectManager: { select: { id: true, name: true } },
            departments: {
              select: {
                departmentId: true, role: true, addedByLinkId: true,
                department: { select: { id: true, name: true, color: true } },
              },
            },
            _count: { select: { tasks: { where: { deletedAt: null } } } },
          },
        },
        linkedBy: { select: { id: true, name: true } },
      },
      orderBy: { linkedAt: 'desc' },
    })

    return ok(res, links, { total: links.length, collab: { id: space.id, name: space.name } })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Unified board ───────────────────────────────────────────
// Registered before the parameterised routes so "board" is never read as a
// project id.

collabProjectRoutes.get('/:collabId/projects/board', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const space = await requireSpace(req.params.collabId as string, actor.orgId)

    const board = await buildCollabBoard(prisma, space.id)

    // The board is built across the collab's links; the actor may not be
    // allowed to see every one of them. Filter to what they can, and say how
    // many were withheld rather than silently showing a partial board.
    const visibleIds = new Set(
      (
        await prisma.project.findMany({
          where: { AND: [visibilityWhere(actor), { id: { in: board.projects.map((p) => p.id) } }] },
          select: { id: true },
        })
      ).map((p) => p.id),
    )
    const withheld = board.projects.length - visibleIds.size

    const filtered = {
      ...board,
      projects: board.projects.filter((p) => visibleIds.has(p.id)),
      excludedProjects: board.excludedProjects.filter((p) => visibleIds.has(p.id)),
      lanes: board.lanes
        .map((lane) => ({ ...lane, cards: lane.cards.filter((c) => visibleIds.has(c.project.id)) }))
        .filter((lane) => lane.cards.length > 0),
    }
    filtered.totals = filtered.lanes.reduce(
      (acc, lane) => {
        for (const c of lane.cards) {
          acc.tasks++
          if (c.status === 'BLOCKED') acc.blocked++
          if (c.dueDate && c.dueDate < new Date() && c.status !== 'COMPLETE') acc.overdue++
        }
        return acc
      },
      { tasks: 0, blocked: 0, overdue: 0 },
    )

    return ok(res, filtered, {
      collab: { id: space.id, name: space.name },
      ...(withheld > 0 ? { projectsWithheld: withheld } : {}),
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Link ────────────────────────────────────────────────────

collabProjectRoutes.post('/:collabId/projects', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const space = await requireSpace(req.params.collabId as string, actor.orgId)

    const body = parseOrThrow(
      z.object({
        projectId: z.string().min(1),
        visibility: z.enum(COLLAB_VISIBILITIES as [CollabVisibility, ...CollabVisibility[]])
          .default('FULL'),
        autoAddMembers: z.boolean().default(true),
      }).strict(),
      req.body,
    )

    const project = await loadProjectForPolicy(prisma, body.projectId)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'LINK_COLLAB', project)

    // One transaction: a link that granted half its access and then failed
    // would leave departments on a project nobody can trace back to a link.
    const result = await prisma.$transaction((tx) =>
      linkProject(tx, {
        coworkSpaceId: space.id,
        projectId: project.id,
        visibility: body.visibility,
        autoAddMembers: body.autoAddMembers,
        actorId: actor.id,
      }),
    )

    return res.status(201).json({
      data: result,
      meta: {
        collab: { id: space.id, name: space.name },
        ...(result.unmatchedDepartmentNames.length
          ? {
              warning:
                `These collab departments do not match a department in Nexus and were skipped: ` +
                result.unmatchedDepartmentNames.join(', '),
            }
          : {}),
      },
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Unlink ──────────────────────────────────────────────────

collabProjectRoutes.delete('/:collabId/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const space = await requireSpace(req.params.collabId as string, actor.orgId)

    const project = await loadProjectForPolicy(prisma, req.params.projectId as string)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'LINK_COLLAB', project)

    const result = await prisma.$transaction((tx) =>
      unlinkProject(tx, {
        coworkSpaceId: space.id,
        projectId: project.id,
        actorId: actor.id,
      }),
    )

    return ok(res, result, {
      collab: { id: space.id, name: space.name },
      ...(result.departmentsKept.length
        ? {
            note:
              'Kept ' +
              result.departmentsKept.map((d) => `${d.name} (${d.reason})`).join(', ') +
              '. Detaching revokes access but never deletes project work.',
          }
        : {}),
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Which departments this collab would grant ───────────────
// Read before linking, so the dialog can say what is about to happen instead of
// the user finding out afterwards.

collabProjectRoutes.get('/:collabId/projects/preview', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const space = await requireSpace(req.params.collabId as string, actor.orgId)
    const resolved = await resolveCollabDepartments(prisma, space.deptNames, actor.orgId)
    const memberCount = await prisma.member.count({
      where: { id: { in: space.memberIds }, orgId: actor.orgId },
    })
    return ok(res, { ...resolved, memberCount })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── The other direction: which collabs is this project in ───
// Mounted under /projects. The detail view needs it to show the "Shared via"
// banner, and a PM needs it to see where a project has been exposed.

export const projectCollabRoutes: ReturnType<typeof Router> = Router()

projectCollabRoutes.get('/:id/collabs', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await loadProjectForPolicy(prisma, req.params.id as string)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'VIEW_PROJECT', project)

    const links = await prisma.collabProjectLink.findMany({
      where: { projectId: project.id, unlinkedAt: null },
      include: {
        coworkSpace: {
          select: { id: true, name: true, type: true, status: true, deptNames: true },
        },
        linkedBy: { select: { id: true, name: true } },
      },
      orderBy: { linkedAt: 'desc' },
    })

    return ok(res, links, { total: links.length })
  } catch (err) {
    return fail(res, err)
  }
})

export default collabProjectRoutes

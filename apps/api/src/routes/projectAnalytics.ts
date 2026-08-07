import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, visibilityWhere, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import {
  summaryFor, healthTrendFor, workloadFor, cycleTimeFor, checkinComplianceFor,
} from '../services/projects/analytics'
import { logActivity } from '../services/projects/activity'

// ─── Analytics & module links ────────────────────────────────
// Analytics is read-only and scoped by department. Module links bind a project
// to a record in another Nexus module (§8.3) through one join table, in both
// directions, with no duplication of either side.

export const projectAnalyticsRoutes: ReturnType<typeof Router> = Router()

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

const scopeQuery = z.object({ departmentId: z.string().optional() })

/**
 * A department filter must name a real department in the actor's org.
 * Without this an unknown id silently scopes to nothing and the dashboard
 * renders a confident set of zeroes.
 */
async function assertDepartment(departmentId: string | undefined, orgId: string) {
  if (!departmentId) return
  const dept = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!dept || dept.orgId !== orgId) {
    throw new ValidationError('Unknown department', { departmentId: ['Not found in this workspace'] })
  }
}

// ─── Analytics ───────────────────────────────────────────────
// Registered before /:id/* routes on the same base so "analytics" is never
// read as a project id.

projectAnalyticsRoutes.get('/analytics/summary', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(scopeQuery, req.query)
    await assertDepartment(q.departmentId, actor.orgId)
    return ok(res, await summaryFor(prisma, { orgId: actor.orgId, departmentId: q.departmentId }))
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.get('/analytics/health-trend', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      scopeQuery.extend({ days: z.coerce.number().int().min(1).max(365).default(90) }),
      req.query,
    )
    await assertDepartment(q.departmentId, actor.orgId)

    const trend = await healthTrendFor(prisma, {
      orgId: actor.orgId, departmentId: q.departmentId, days: q.days,
    })

    return ok(res, trend, {
      // Said explicitly so the client can label a short history rather than
      // drawing a confident flat line over days nothing is known about.
      ...(trend.coverage.daysWithData === 0
        ? { note: 'No health history yet. The nightly sweep records one point per project per day.' }
        : trend.coverage.daysWithData < q.days
          ? { note: `History covers ${trend.coverage.daysWithData} of the ${q.days} days requested.` }
          : {}),
    })
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.get('/analytics/workload', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(scopeQuery, req.query)
    await assertDepartment(q.departmentId, actor.orgId)
    return ok(res, await workloadFor(prisma, { orgId: actor.orgId, departmentId: q.departmentId }))
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.get('/analytics/cycle-time', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(scopeQuery.extend({ typeId: z.string().optional() }), req.query)
    await assertDepartment(q.departmentId, actor.orgId)
    return ok(res, await cycleTimeFor(prisma, {
      orgId: actor.orgId, departmentId: q.departmentId, typeId: q.typeId,
    }))
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.get('/analytics/checkin-compliance', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      scopeQuery.extend({ days: z.coerce.number().int().min(1).max(365).default(90) }),
      req.query,
    )
    await assertDepartment(q.departmentId, actor.orgId)
    return ok(res, await checkinComplianceFor(prisma, {
      orgId: actor.orgId, departmentId: q.departmentId, days: q.days,
    }))
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Module links ────────────────────────────────────────────

const MODULES = [
  'BRIEF', 'NPD', 'FORMULATION', 'ARTWORK', 'COMPONENT',
  'TECH_TRANSFER', 'PRODUCTION_ORDER', 'CM', 'DASHBOARD_SKU',
] as const

const LINK_TYPES = ['SOURCE', 'OUTPUT', 'RELATED', 'BLOCKS'] as const

/**
 * "Related Initiatives" for a record in another module — the reverse direction
 * of §8.3, read by that module's detail page.
 *
 * Registered before /:id/links so "links" is not read as a project id.
 */
projectAnalyticsRoutes.get('/links/by-record', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      z.object({ module: z.enum(MODULES), recordId: z.string().min(1) }),
      req.query,
    )

    const links = await prisma.projectModuleLink.findMany({
      where: {
        module: q.module,
        recordId: q.recordId,
        // Scoped in SQL: a record's related-initiatives panel must not reveal
        // a project the viewer has no access to.
        project: { is: visibilityWhere(actor) },
      },
      include: {
        project: {
          select: {
            id: true, projectNumber: true, title: true, status: true,
            health: true, healthBand: true, percentComplete: true, targetEndDate: true,
            ownerDepartment: { select: { id: true, name: true, color: true } },
            projectManager: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(res, links, { total: links.length })
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.delete('/links/:linkId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const link = await prisma.projectModuleLink.findUnique({
      where: { id: req.params.linkId as string },
    })
    if (!link) throw new NotFoundError('Link not found')

    const project = await loadProjectForPolicy(prisma, link.projectId)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'EDIT_PROJECT', project)

    await prisma.projectModuleLink.delete({ where: { id: link.id } })

    await logActivity(prisma, {
      projectId: link.projectId,
      actorId: actor.id,
      entityType: 'PROJECT',
      entityId: link.id,
      action: 'UNLINKED_RECORD',
      summary: `Unlinked ${link.module.replace(/_/g, ' ').toLowerCase()} ${link.label ?? link.recordId}`,
    })

    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.get('/:id/links', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await loadProjectForPolicy(prisma, req.params.id as string)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'VIEW_PROJECT', project)

    const links = await prisma.projectModuleLink.findMany({
      where: { projectId: project.id },
      orderBy: [{ module: 'asc' }, { createdAt: 'desc' }],
    })

    // Grouped by module so the panel renders sections rather than one flat
    // list of mixed record types.
    const byModule = new Map<string, typeof links>()
    for (const l of links) {
      const list = byModule.get(l.module)
      if (list) list.push(l)
      else byModule.set(l.module, [l])
    }

    return ok(res, links, {
      total: links.length,
      byModule: [...byModule.entries()].map(([module, items]) => ({ module, count: items.length })),
    })
  } catch (err) {
    return fail(res, err)
  }
})

projectAnalyticsRoutes.post('/:id/links', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await loadProjectForPolicy(prisma, req.params.id as string)
    if (!project || project.deletedAt) throw new NotFoundError('Project not found')
    assertCan(actor, 'EDIT_PROJECT', project)

    const body = parseOrThrow(
      z.object({
        module: z.enum(MODULES),
        recordId: z.string().min(1).max(200),
        // Cached for display only. The linked module owns the record; this is
        // a label so the panel does not have to fan out a query per link.
        label: z.string().max(300).optional(),
        linkType: z.enum(LINK_TYPES).default('RELATED'),
      }).strict(),
      req.body,
    )

    const existing = await prisma.projectModuleLink.findUnique({
      where: {
        projectId_module_recordId: {
          projectId: project.id, module: body.module, recordId: body.recordId,
        },
      },
    })
    if (existing) {
      throw new ConflictError('That record is already linked to this project', {
        linkId: existing.id,
      })
    }

    const link = await prisma.projectModuleLink.create({
      data: {
        projectId: project.id,
        module: body.module,
        recordId: body.recordId,
        label: body.label ?? null,
        linkType: body.linkType,
      },
    })

    await logActivity(prisma, {
      projectId: project.id,
      actorId: actor.id,
      entityType: 'PROJECT',
      entityId: link.id,
      action: 'LINKED_RECORD',
      summary: `Linked ${body.module.replace(/_/g, ' ').toLowerCase()} ${body.label ?? body.recordId}`,
    })

    return res.status(201).json({ data: link, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

export default projectAnalyticsRoutes

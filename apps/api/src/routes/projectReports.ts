import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, visibilityWhere, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { REPORT_TYPES } from '../services/projects/reports/payload'
import {
  generateProjectReport, generatePortfolioReport, payloadToCsv,
} from '../services/projects/reports/generate'
import { summariseCheckins, isNarrativeConfigured } from '../services/projects/reports/narrative'
import { logActivity } from '../services/projects/activity'

export const projectReportRoutes: ReturnType<typeof Router> = Router()

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
async function requireProject(projectId: string) {
  const p = await loadProjectForPolicy(prisma, projectId)
  if (!p || p.deletedAt) throw new NotFoundError('Project not found')
  return p
}

const periodSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
})

function resolvePeriod(body: { periodStart?: Date; periodEnd?: Date }) {
  if (body.periodStart && body.periodEnd) {
    if (body.periodEnd < body.periodStart) {
      throw new ValidationError('A period cannot end before it starts', {
        periodEnd: ['Must be on or after periodStart'],
      })
    }
    return { start: body.periodStart, end: body.periodEnd }
  }
  return undefined
}

// ─── Read a report ───────────────────────────────────────────
// Registered before /:id so "reports" is never read as a project id.

projectReportRoutes.get('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const report = await prisma.projectReport.findUnique({
      where: { id: req.params.reportId as string },
      include: {
        project: { select: { id: true, projectNumber: true, title: true } },
        scopeDepartment: { select: { id: true, name: true } },
        generatedByUser: { select: { id: true, name: true } },
      },
    })
    if (!report || report.orgId !== actor.orgId) throw new NotFoundError('Report not found')

    // A project-scoped report inherits the project's visibility.
    if (report.projectId) {
      const project = await requireProject(report.projectId)
      assertCan(actor, 'VIEW_PROJECT', project)
    }

    return ok(res, report)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Publish ─────────────────────────────────────────────────
// Publishing freezes nothing further — the payload was already frozen at
// generation. It marks the report as the one people should read, and is
// deliberately a separate, permissioned step from generating it.

projectReportRoutes.post('/reports/:reportId/publish', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const report = await prisma.projectReport.findUnique({
      where: { id: req.params.reportId as string },
    })
    if (!report || report.orgId !== actor.orgId) throw new NotFoundError('Report not found')

    if (report.projectId) {
      const project = await requireProject(report.projectId)
      assertCan(actor, 'PUBLISH_REPORT', project)
    } else if (actor.role !== 'ADMIN' && actor.role !== 'OPS_MANAGER') {
      throw new ConflictError('Portfolio reports may only be published by an admin or ops manager')
    }

    if (report.isPublished) throw new ConflictError('This report is already published')

    const body = parseOrThrow(
      z.object({
        // The narrative is AI-drafted and must be editable before it goes out.
        narrative: z.string().max(20_000).optional(),
        distribution: z.array(z.object({
          channel: z.enum(['IN_APP', 'EMAIL']),
          target: z.string(),
        })).default([]),
      }).strict(),
      req.body ?? {},
    )

    const updated = await prisma.projectReport.update({
      where: { id: report.id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        ...(body.narrative !== undefined ? { narrative: body.narrative } : {}),
        distribution: body.distribution as unknown as object,
      },
    })

    if (report.projectId) {
      await logActivity(prisma, {
        projectId: report.projectId,
        actorId: actor.id,
        entityType: 'REPORT',
        entityId: report.id,
        action: 'PUBLISHED',
        summary: `Published "${report.title}"`,
      })
    }

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Edit the drafted narrative ──────────────────────────────

projectReportRoutes.patch('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const report = await prisma.projectReport.findUnique({
      where: { id: req.params.reportId as string },
    })
    if (!report || report.orgId !== actor.orgId) throw new NotFoundError('Report not found')

    if (report.projectId) {
      const project = await requireProject(report.projectId)
      assertCan(actor, 'PUBLISH_REPORT', project)
    }

    // Only the narrative is editable. The payload is the frozen record of what
    // was true when the report ran; letting it be edited would make every past
    // report unreliable.
    const body = parseOrThrow(
      z.object({ narrative: z.string().max(20_000).nullable() }).strict(),
      req.body,
    )

    if (report.isPublished) {
      throw new ConflictError(
        'A published report cannot be edited. Generate a new one instead.',
      )
    }

    const updated = await prisma.projectReport.update({
      where: { id: report.id },
      data: { narrative: body.narrative },
    })
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Export ──────────────────────────────────────────────────
// Rendered from the stored payload. PDF is produced client-side with the
// jspdf already bundled in the web app; the API serves JSON and CSV.

projectReportRoutes.get('/reports/:reportId/export', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(z.object({ format: z.enum(['csv', 'json']).default('csv') }), req.query)

    const report = await prisma.projectReport.findUnique({
      where: { id: req.params.reportId as string },
    })
    if (!report || report.orgId !== actor.orgId) throw new NotFoundError('Report not found')

    if (report.projectId) {
      const project = await requireProject(report.projectId)
      assertCan(actor, 'VIEW_PROJECT', project)
    }

    const safeName = report.title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').slice(0, 80)

    if (q.format === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`)
      return res.send(JSON.stringify({
        title: report.title,
        reportType: report.reportType,
        generatedAt: report.createdAt,
        narrative: report.narrative,
        payload: report.payload,
      }, null, 2))
    }

    const csv = payloadToCsv(report.payload as Record<string, unknown>)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`)
    // Narrative rides along as a comment block so a CSV export is not missing
    // the part a human actually wrote.
    const header = report.narrative
      ? report.narrative.split('\n').map((l) => `# ${l}`).join('\n') + '\n\n'
      : ''
    return res.send(header + csv)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Reports on a project ────────────────────────────────────

projectReportRoutes.get('/:id/reports', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)

    const rows = await prisma.projectReport.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, reportType: true, title: true, periodStart: true, periodEnd: true,
        isPublished: true, publishedAt: true, createdAt: true, generatedBy: true,
        narrative: true,
        generatedByUser: { select: { id: true, name: true } },
      },
    })
    return ok(res, rows, { total: rows.length, narrativeAvailable: isNarrativeConfigured() })
  } catch (err) {
    return fail(res, err)
  }
})

projectReportRoutes.post('/:id/reports/generate', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    // Generating is a PM action: it costs an AI call and creates a record
    // people will read as authoritative.
    assertCan(actor, 'PUBLISH_REPORT', project)

    const body = parseOrThrow(
      periodSchema.extend({
        reportType: z.enum(['PROJECT_UPDATE', 'CLOSEOUT']).default('PROJECT_UPDATE'),
        withNarrative: z.boolean().default(true),
      }).strict(),
      req.body ?? {},
    )

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      select: { status: true, lessonsLearned: true, orgId: true },
    })
    if (!full) throw new NotFoundError('Project not found')

    // A closeout before the project is finished would report a partial delivery
    // as the final record.
    if (body.reportType === 'CLOSEOUT' && !['COMPLETED', 'ARCHIVED'].includes(full.status)) {
      throw new ConflictError(
        `A closeout report can only be generated for a COMPLETED project (currently ${full.status})`,
      )
    }

    const result = await generateProjectReport(prisma, {
      projectId: project.id,
      reportType: body.reportType,
      period: resolvePeriod(body),
      orgId: full.orgId,
      actorId: actor.id,
      withNarrative: body.withNarrative,
    })

    await logActivity(prisma, {
      projectId: project.id,
      actorId: actor.id,
      entityType: 'REPORT',
      entityId: result.reportId,
      action: 'GENERATED',
      summary: `Generated "${result.title}"`,
    })

    return res.status(201).json({
      data: result,
      meta: result.narrativeSkippedReason ? { narrativeSkipped: result.narrativeSkippedReason } : {},
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Portfolio reports ───────────────────────────────────────

projectReportRoutes.post('/reports/portfolio', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    if (actor.role !== 'ADMIN' && actor.role !== 'OPS_MANAGER') {
      return res.status(403).json({
        error: { code: 'PolicyError', message: 'Requires ADMIN or OPS_MANAGER' },
      })
    }

    const body = parseOrThrow(
      periodSchema.extend({
        reportType: z.enum(['STATUS_UPDATE', 'EXECUTIVE_ROLLUP', 'DEPARTMENT_DIGEST'])
          .default('STATUS_UPDATE'),
        departmentId: z.string().optional(),
        withNarrative: z.boolean().default(true),
      }).strict(),
      req.body ?? {},
    )

    if (body.reportType === 'DEPARTMENT_DIGEST' && !body.departmentId) {
      throw new ValidationError('A department digest needs a department', {
        departmentId: ['Required for DEPARTMENT_DIGEST'],
      })
    }

    const result = await generatePortfolioReport(prisma, {
      reportType: body.reportType,
      departmentId: body.departmentId ?? null,
      orgId: actor.orgId,
      period: resolvePeriod(body),
      actorId: actor.id,
      withNarrative: body.withNarrative,
    })

    return res.status(201).json({
      data: result,
      meta: result.narrativeSkippedReason ? { narrativeSkipped: result.narrativeSkippedReason } : {},
    })
  } catch (err) {
    return fail(res, err)
  }
})

projectReportRoutes.get('/reports', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      z.object({
        reportType: z.enum(REPORT_TYPES as [string, ...string[]]).optional(),
        departmentId: z.string().optional(),
        published: z.enum(['true', 'false']).optional(),
        limit: z.coerce.number().int().positive().max(100).default(25),
      }),
      req.query,
    )

    const rows = await prisma.projectReport.findMany({
      where: {
        orgId: actor.orgId,
        ...(q.reportType ? { reportType: q.reportType } : {}),
        ...(q.departmentId ? { scopeDepartmentId: q.departmentId } : {}),
        ...(q.published ? { isPublished: q.published === 'true' } : {}),
        // Project-scoped reports are filtered to what the actor can see.
        OR: [
          { projectId: null },
          { project: { is: visibilityWhere(actor) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: {
        id: true, reportType: true, title: true, periodStart: true, periodEnd: true,
        isPublished: true, publishedAt: true, createdAt: true,
        project: { select: { id: true, projectNumber: true, title: true } },
        scopeDepartment: { select: { id: true, name: true } },
      },
    })
    return ok(res, rows, { total: rows.length, narrativeAvailable: isNarrativeConfigured() })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Check-in summarisation ──────────────────────────────────

projectReportRoutes.post('/:id/reports/summarise-checkins', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)

    const body = parseOrThrow(periodSchema.strict(), req.body ?? {})
    const period = resolvePeriod(body) ?? {
      start: new Date(Date.now() - 14 * 86_400_000),
      end: new Date(),
    }

    const rows = await prisma.projectCheckin.findMany({
      where: {
        projectId: project.id,
        status: 'RESPONDED',
        respondedAt: { gte: period.start, lte: period.end },
      },
      include: { department: { select: { name: true } } },
    })

    const result = await summariseCheckins(
      rows.map((c) => ({
        department: c.department?.name ?? 'All hands',
        confidence: c.confidence,
        progress: c.progressSummary,
        blockers: c.blockers,
        needs: c.needsFromOthers,
      })),
    )

    return ok(res, result, { checkinsConsidered: rows.length })
  } catch (err) {
    return fail(res, err)
  }
})

export default projectReportRoutes

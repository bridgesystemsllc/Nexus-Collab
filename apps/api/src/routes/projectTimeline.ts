import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { computeCriticalPath, durationDays } from '../services/projects/dependencies'
import { slipDaysBetween, computeHealth } from '../services/projects/health'
import { logActivity, touchProject } from '../services/projects/activity'
import { scheduleRecompute, recomputeProject } from '../services/projects/recompute'

export const projectTimelineRoutes: ReturnType<typeof Router> = Router()

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
  const project = await loadProjectForPolicy(prisma, projectId)
  if (!project || project.deletedAt) throw new NotFoundError('Project not found')
  return project
}

const PHASE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'SKIPPED'] as const
const MILESTONE_STATUSES = ['PENDING', 'AT_RISK', 'MISSED', 'COMPLETE'] as const

// ─── Timeline ────────────────────────────────────────────────
// One endpoint returning everything the Gantt needs: phases, milestones,
// tasks, the critical path, and baseline-vs-current slip at every level.
// Assembled in a fixed number of queries so a 200-task project costs the same
// as a 20-task one.

projectTimelineRoutes.get('/:id/timeline', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)
    const now = new Date()

    const [full, phases, milestones, tasks, dependencies] = await Promise.all([
      prisma.project.findUnique({
        where: { id: project.id },
        select: {
          id: true, projectNumber: true, title: true, status: true,
          health: true, healthBand: true, percentComplete: true,
          startDate: true, targetEndDate: true, baselineEndDate: true,
          actualEndDate: true, baselinedAt: true,
        },
      }),
      prisma.projectPhase.findMany({
        where: { projectId: project.id },
        orderBy: { sequence: 'asc' },
        include: { department: { select: { id: true, code: true, name: true, color: true } } },
      }),
      prisma.projectMilestone.findMany({
        where: { projectId: project.id },
        orderBy: { dueDate: 'asc' },
        include: {
          department: { select: { id: true, code: true, name: true, color: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { taskNumber: 'asc' }],
        include: {
          department: { select: { id: true, code: true, name: true, color: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.taskDependency.findMany({
        where: { successor: { projectId: project.id, deletedAt: null } },
        select: { id: true, predecessorId: true, successorId: true, dependencyType: true, lagDays: true },
      }),
    ])

    if (!full) throw new NotFoundError('Project not found')

    // A cycle here would mean corrupt stored data rather than bad input, so
    // report the timeline without a critical path instead of failing the whole
    // request — the user still needs to see their schedule.
    let criticalPath = new Set<string>()
    let floats = new Map<string, number>()
    let projectDuration = 0
    let criticalPathError: string | null = null
    try {
      const result = computeCriticalPath(
        tasks.map((t) => ({ id: t.id, startDate: t.startDate, dueDate: t.dueDate })),
        dependencies,
      )
      criticalPath = result.criticalPath
      floats = result.float
      projectDuration = result.projectDuration
    } catch (err) {
      criticalPathError = (err as Error).message
      console.error(`[projects] critical path failed for ${project.id}:`, err)
    }

    return ok(res, {
      project: {
        ...full,
        slipDays: slipDaysBetween(full.baselineEndDate, full.targetEndDate),
      },
      phases: phases.map((p) => ({
        ...p,
        slipDays: slipDaysBetween(p.baselineEnd, p.endDate),
      })),
      milestones: milestones.map((m) => ({
        ...m,
        // Computed rather than stored: a generated column would need a
        // migration to change, and the definition of "at risk" will move.
        slipDays: slipDaysBetween(m.baselineDate, m.dueDate),
        isOverdue: m.status !== 'COMPLETE' && m.dueDate < now,
      })),
      tasks: tasks.map((t) => ({
        ...t,
        durationDays: durationDays({ id: t.id, startDate: t.startDate, dueDate: t.dueDate }),
        isCriticalPath: criticalPath.has(t.id),
        floatDays: floats.get(t.id) ?? null,
        isOverdue:
          !['COMPLETE', 'CANCELLED'].includes(t.status) && !!t.dueDate && t.dueDate < now,
      })),
      dependencies,
    }, {
      taskCount: tasks.length,
      criticalPathCount: criticalPath.size,
      projectDurationDays: projectDuration,
      ...(criticalPathError ? { criticalPathError } : {}),
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Health breakdown ────────────────────────────────────────
// Exposes the penalties behind the cached score. The Overview tab shows this
// because a number with no explanation cannot be acted on.

projectTimelineRoutes.get('/:id/health', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)

    // Recompute inline so the breakdown always matches what is shown. This is
    // one project on demand, not the list view, so the cost is acceptable.
    const result = await recomputeProject(prisma, project.id)
    if (!result) throw new NotFoundError('Project not found')

    return ok(res, {
      score: result.health.score,
      band: result.health.band,
      penalties: result.health.penalties,
      percentComplete: result.percentComplete,
      ...(result.statusChangedTo ? { statusAutoSetTo: result.statusChangedTo } : {}),
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Phases ──────────────────────────────────────────────────

const phaseSchema = z.object({
  name: z.string().min(1).max(200),
  sequence: z.number().int().positive(),
  departmentId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  colorHex: z.string().optional(),
}).strict()

projectTimelineRoutes.post('/:id/phases', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const body = parseOrThrow(phaseSchema, req.body)

    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      throw new ValidationError('A phase cannot end before it starts', {
        endDate: ['Must be on or after startDate'],
      })
    }

    const clash = await prisma.projectPhase.findUnique({
      where: { projectId_sequence: { projectId: project.id, sequence: body.sequence } },
    })
    if (clash) throw new ConflictError(`Sequence ${body.sequence} is already used by "${clash.name}"`)

    const phase = await prisma.projectPhase.create({
      data: { projectId: project.id, ...body, status: 'NOT_STARTED' },
    })
    await logActivity(prisma, {
      projectId: project.id, actorId: actor.id, departmentId: body.departmentId ?? null,
      entityType: 'PHASE', entityId: phase.id, action: 'CREATED',
      summary: `Added phase "${body.name}"`,
    })
    scheduleRecompute(prisma, project.id)
    return res.status(201).json({ data: phase, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectTimelineRoutes.patch('/:id/phases/:phaseId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const body = parseOrThrow(
      phaseSchema.partial().extend({
        status: z.enum(PHASE_STATUSES).optional(),
        actualStart: z.coerce.date().nullable().optional(),
        actualEnd: z.coerce.date().nullable().optional(),
      }).strict(),
      req.body,
    )

    const existing = await prisma.projectPhase.findFirst({
      where: { id: req.params.phaseId as string, projectId: project.id },
    })
    if (!existing) throw new NotFoundError('Phase not found')

    if (body.sequence && body.sequence !== existing.sequence) {
      const clash = await prisma.projectPhase.findUnique({
        where: { projectId_sequence: { projectId: project.id, sequence: body.sequence } },
      })
      if (clash) throw new ConflictError(`Sequence ${body.sequence} is already in use`)
    }

    const updated = await prisma.projectPhase.update({ where: { id: existing.id }, data: body })
    await touchProject(prisma, project.id)
    scheduleRecompute(prisma, project.id)
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectTimelineRoutes.delete('/:id/phases/:phaseId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)

    const phase = await prisma.projectPhase.findFirst({
      where: { id: req.params.phaseId as string, projectId: project.id },
    })
    if (!phase) throw new NotFoundError('Phase not found')

    // Tasks survive; they are simply unphased. Cascading the delete would
    // destroy work because someone reorganised the plan.
    const detached = await prisma.task.count({ where: { phaseId: phase.id, deletedAt: null } })
    await prisma.projectPhase.delete({ where: { id: phase.id } })

    await logActivity(prisma, {
      projectId: project.id, actorId: actor.id,
      entityType: 'PHASE', entityId: phase.id, action: 'DELETED',
      summary: `Removed phase "${phase.name}"${detached ? ` — ${detached} task(s) are now unphased` : ''}`,
    })
    scheduleRecompute(prisma, project.id)
    return ok(res, { deleted: true, detachedTasks: detached })
  } catch (err) {
    return fail(res, err)
  }
})

// Reorder in one transaction. Sequence is unique per project, so a naive
// pass would collide mid-way; every phase is parked on a negative sequence
// first, which no real phase can occupy.
projectTimelineRoutes.post('/:id/phases/reorder', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const body = parseOrThrow(
      z.object({ orderedIds: z.array(z.string()).min(1) }).strict(),
      req.body,
    )

    const phases = await prisma.projectPhase.findMany({
      where: { projectId: project.id },
      select: { id: true },
    })
    const known = new Set(phases.map((p) => p.id))
    const unknown = body.orderedIds.filter((id) => !known.has(id))
    if (unknown.length) {
      throw new ValidationError('Some phases do not belong to this project', { orderedIds: unknown })
    }
    if (body.orderedIds.length !== phases.length) {
      throw new ValidationError('Supply every phase in the new order', {
        orderedIds: [`Expected ${phases.length} ids, got ${body.orderedIds.length}`],
      })
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < body.orderedIds.length; i++) {
        await tx.projectPhase.update({
          where: { id: body.orderedIds[i] as string },
          data: { sequence: -(i + 1) },
        })
      }
      for (let i = 0; i < body.orderedIds.length; i++) {
        await tx.projectPhase.update({
          where: { id: body.orderedIds[i] as string },
          data: { sequence: i + 1 },
        })
      }
    })

    const reordered = await prisma.projectPhase.findMany({
      where: { projectId: project.id },
      orderBy: { sequence: 'asc' },
    })
    return ok(res, reordered)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Milestones ──────────────────────────────────────────────

const milestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  dueDate: z.coerce.date(),
  phaseId: z.string().optional(),
  ownerId: z.string().optional(),
  departmentId: z.string().optional(),
  isGate: z.boolean().default(false),
}).strict()

projectTimelineRoutes.post('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const body = parseOrThrow(milestoneSchema, req.body)

    if (body.phaseId) {
      const phase = await prisma.projectPhase.findFirst({
        where: { id: body.phaseId, projectId: project.id },
      })
      if (!phase) throw new ValidationError('Unknown phase', { phaseId: ['Not on this project'] })
    }

    const milestone = await prisma.projectMilestone.create({
      data: { projectId: project.id, ...body, status: 'PENDING' },
    })
    await logActivity(prisma, {
      projectId: project.id, actorId: actor.id, departmentId: body.departmentId ?? null,
      entityType: 'MILESTONE', entityId: milestone.id, action: 'CREATED',
      summary: `Added ${body.isGate ? 'gate' : 'milestone'} "${body.name}"`,
    })
    scheduleRecompute(prisma, project.id)
    return res.status(201).json({ data: milestone, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectTimelineRoutes.patch('/:id/milestones/:mid', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const body = parseOrThrow(
      milestoneSchema.partial().extend({
        status: z.enum(MILESTONE_STATUSES).optional(),
        completedDate: z.coerce.date().nullable().optional(),
      }).strict(),
      req.body,
    )

    const existing = await prisma.projectMilestone.findFirst({
      where: { id: req.params.mid as string, projectId: project.id },
    })
    if (!existing) throw new NotFoundError('Milestone not found')

    const updated = await prisma.projectMilestone.update({
      where: { id: existing.id },
      data: {
        ...body,
        // Completing a milestone stamps the date if the caller did not.
        completedDate:
          body.status === 'COMPLETE' && !body.completedDate && !existing.completedDate
            ? new Date()
            : body.completedDate,
      },
    })

    if (body.dueDate && existing.baselineDate) {
      const slip = slipDaysBetween(existing.baselineDate, body.dueDate)
      if (slip > 0) {
        await logActivity(prisma, {
          projectId: project.id, actorId: actor.id,
          entityType: 'MILESTONE', entityId: existing.id, action: 'DATE_MOVED',
          summary: `"${existing.name}" moved to ${body.dueDate.toISOString().slice(0, 10)} — ${slip}d past baseline`,
          fieldChanges: { dueDate: { from: existing.dueDate, to: body.dueDate } },
        })
      }
    }

    // A missed gate is the signal that blocks everything downstream, so it is
    // announced immediately rather than waiting for the nightly sweep.
    if (existing.isGate && body.status === 'MISSED') {
      const full = await prisma.project.findUnique({
        where: { id: project.id },
        select: { projectNumber: true, executiveSponsorId: true, projectManagerId: true },
      })
      for (const target of [full?.executiveSponsorId, full?.projectManagerId].filter(Boolean)) {
        await prisma.pulse.create({
          data: {
            type: 'ALERT',
            message: `Gate missed on ${full?.projectNumber ?? 'project'}: "${existing.name}"`,
            deptName: 'Projects',
            targetId: target as string,
            metadata: { projectId: project.id, milestoneId: existing.id } as object,
          },
        }).catch((e) => console.error('[projects] gate alert failed:', e?.message))
      }
    }

    await touchProject(prisma, project.id)
    scheduleRecompute(prisma, project.id)
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectTimelineRoutes.delete('/:id/milestones/:mid', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)

    const existing = await prisma.projectMilestone.findFirst({
      where: { id: req.params.mid as string, projectId: project.id },
    })
    if (!existing) throw new NotFoundError('Milestone not found')

    await prisma.projectMilestone.delete({ where: { id: existing.id } })
    scheduleRecompute(prisma, project.id)
    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

export default projectTimelineRoutes

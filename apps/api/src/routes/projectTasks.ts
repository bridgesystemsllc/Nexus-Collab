import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan, can, type PolicyActor, type PolicyProject } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, visibilityWhere, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { allocateTaskNumber } from '../services/projects/numbering'
import { assertNoCycle } from '../services/projects/dependencies'
import { logActivity, diffFields, touchProject } from '../services/projects/activity'
import { scheduleRecompute } from '../services/projects/recompute'
import { syncCoworkAddSafe, syncCoworkRemoveSafe } from '../services/projects/coworkSync'

export const projectTaskRoutes: ReturnType<typeof Router> = Router()

const TASK_STATUSES = [
  'NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE', 'CANCELLED',
] as const

const MAX_LIMIT = 100

function ok(res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return res.json({ data, meta })
}

function fail(res: Response, err: unknown) {
  const { status, body } = errorResponse(err)
  return res.status(status).json(body)
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new ValidationError('Validation failed', result.error.flatten())
  return result.data
}

/**
 * Load a task with the project context the policy needs. Returning both keeps
 * every task route on one authorization path: resolve actor, load task +
 * project, call can() with the task's own lane.
 */
async function requireTaskWithProject(taskId: string): Promise<{
  task: {
    id: string; projectId: string | null; departmentId: string | null; ownerId: string | null
    status: string; acceptanceStatus: string | null; taskNumber: number | null; title: string
    requestedById: string | null; deletedAt: Date | null
  }
  project: PolicyProject
}> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, projectId: true, departmentId: true, ownerId: true, status: true,
      acceptanceStatus: true, taskNumber: true, title: true, requestedById: true, deletedAt: true,
    },
  })
  if (!task || task.deletedAt) throw new NotFoundError('Task not found')
  if (!task.projectId) throw new ConflictError('This task does not belong to a project')

  const project = await loadProjectForPolicy(prisma, task.projectId)
  // A task on a soft-deleted project is itself unreachable, and reporting it
  // as forbidden would confirm the project exists to a caller who cannot see it.
  if (!project || project.deletedAt) throw new NotFoundError('Project not found')
  return { task, project }
}

// A task the actor may edit: own lane if theirs, other lane otherwise. The
// policy decides which grant applies rather than the route guessing.
function assertCanEditTask(
  actor: PolicyActor,
  project: PolicyProject,
  task: { departmentId: string | null; ownerId: string | null },
) {
  const own = can(actor, 'EDIT_TASK_OWN_LANE', project, task)
  if (own.allowed) return
  const other = can(actor, 'EDIT_TASK_OTHER_LANE', project, task)
  if (other.allowed) return
  // Report the own-lane reason: it is the more specific and more actionable
  // of the two ("only edit tasks assigned to you" beats "not the PM").
  assertCan(actor, 'EDIT_TASK_OWN_LANE', project, task)
}

// ─── My work (cross-project queue) ───────────────────────────
// Registered before the /:taskId routes so "my" is never read as an id.

projectTaskRoutes.get('/tasks/my', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      z.object({
        status: z.string().optional(),
        dueBefore: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(50),
      }),
      req.query,
    )

    const tasks = await prisma.task.findMany({
      where: {
        ownerId: actor.id,
        deletedAt: null,
        project: { is: visibilityWhere(actor) },
        ...(q.status ? { status: { in: q.status.split(',') } } : { status: { notIn: ['COMPLETE', 'CANCELLED'] } }),
        ...(q.dueBefore ? { dueDate: { lte: q.dueBefore } } : {}),
        // A pending cross-department request is not yet the assignee's work.
        OR: [{ acceptanceStatus: null }, { acceptanceStatus: 'ACCEPTED' }],
      },
      take: q.limit,
      orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
      include: {
        project: { select: { id: true, projectNumber: true, title: true, healthBand: true } },
        department: { select: { id: true, code: true, name: true, color: true } },
      },
    })
    return ok(res, tasks, { total: tasks.length })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── List tasks on a project ─────────────────────────────────

projectTaskRoutes.get('/:id/tasks', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const projectId = req.params.id as string
    const project = await loadProjectForPolicy(prisma, projectId)
    if (!project) throw new NotFoundError('Project not found')
    assertCan(actor, 'VIEW_PROJECT', project)

    const q = parseOrThrow(
      z.object({
        departmentId: z.string().optional(),
        assigneeId: z.string().optional(),
        status: z.string().optional(),
        phaseId: z.string().optional(),
        groupBy: z.enum(['status', 'department', 'assignee', 'phase']).optional(),
      }),
      req.query,
    )

    // One query for the whole board — no per-column or per-row follow-ups.
    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.assigneeId ? { ownerId: q.assigneeId } : {}),
        ...(q.status ? { status: { in: q.status.split(',') } } : {}),
        ...(q.phaseId ? { phaseId: q.phaseId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { taskNumber: 'asc' }],
      include: {
        department: { select: { id: true, code: true, name: true, color: true } },
        owner: { select: { id: true, name: true, avatar: true } },
        requestedBy: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true, sequence: true } },
        checklist: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { dependenciesIn: true, dependenciesOut: true, subtasks: true } },
      },
    })

    if (!q.groupBy) return ok(res, tasks, { total: tasks.length })

    const key = (t: (typeof tasks)[number]): string => {
      if (q.groupBy === 'status') return t.status
      if (q.groupBy === 'department') return t.departmentId ?? 'unassigned'
      if (q.groupBy === 'assignee') return t.ownerId ?? 'unassigned'
      return t.phaseId ?? 'unphased'
    }
    const groups: Record<string, typeof tasks> = {}
    for (const t of tasks) (groups[key(t)] ??= []).push(t)

    return ok(res, groups, { total: tasks.length, groupBy: q.groupBy })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Create a task ───────────────────────────────────────────

const createTaskSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(10_000).optional(),
    departmentId: z.string(),
    ownerId: z.string().optional(),
    phaseId: z.string().optional(),
    milestoneId: z.string().optional(),
    parentId: z.string().optional(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
    status: z.enum(TASK_STATUSES).default('NOT_STARTED'),
    startDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    estimatedHours: z.number().nonnegative().optional(),
    tags: z.array(z.string()).default([]),
    sortOrder: z.number().int().default(0),
  })
  .strict()

projectTaskRoutes.post('/:id/tasks', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const projectId = req.params.id as string
    const project = await loadProjectForPolicy(prisma, projectId)
    if (!project) throw new NotFoundError('Project not found')
    const body = parseOrThrow(createTaskSchema, req.body)

    // The lane must be a participating department — otherwise the task would
    // be invisible in every department view.
    const participating = project.departments.some((d) => d.departmentId === body.departmentId)
    if (!participating) {
      throw new ValidationError(
        'That department is not participating in this project. Add it first.',
        { departmentId: ['Not a participating department'] },
      )
    }

    // Own lane or another lane? The distinction is the whole cross-department
    // mechanic: a task raised into someone else's lane arrives as a request
    // they must accept, not as work already on their board.
    const ownLane = can(actor, 'CREATE_TASK_OWN_LANE', project, { departmentId: body.departmentId })
    const isRequest = !ownLane.allowed
    if (isRequest) {
      assertCan(actor, 'CREATE_TASK_OTHER_LANE', project, { departmentId: body.departmentId })
    }

    const created = await prisma.$transaction(async (tx) => {
      const taskNumber = await allocateTaskNumber(tx, projectId)
      const task = await tx.task.create({
        data: {
          projectId,
          taskNumber,
          title: body.title,
          description: body.description ?? null,
          departmentId: body.departmentId,
          ownerId: body.ownerId ?? null,
          phaseId: body.phaseId ?? null,
          milestoneId: body.milestoneId ?? null,
          parentId: body.parentId ?? null,
          priority: body.priority,
          status: body.status,
          startDate: body.startDate ?? null,
          dueDate: body.dueDate ?? null,
          estimatedHours: body.estimatedHours ?? null,
          tags: body.tags,
          sortOrder: body.sortOrder,
          createdById: actor.id,
          isCrossDept: isRequest,
          requestedById: isRequest ? actor.id : null,
          acceptanceStatus: isRequest ? 'PENDING' : null,
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      })

      await logActivity(tx, {
        projectId,
        actorId: actor.id,
        departmentId: body.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: isRequest ? 'CROSS_DEPT_REQUESTED' : 'CREATED',
        summary: isRequest
          ? `Requested #${taskNumber} "${body.title}" from ${task.department?.name ?? 'another department'}`
          : `Created #${taskNumber} "${body.title}"`,
      })
      await touchProject(tx, projectId)
      scheduleRecompute(prisma, projectId)
      return task
    })

    // An assignee gets the project surfaced in Cowork (out of band).
    if (body.ownerId) syncCoworkAddSafe(prisma, projectId, body.ownerId)

    return res.status(201).json({
      data: created,
      meta: isRequest
        ? { pendingAcceptance: true, message: 'Sent as a cross-department request awaiting acceptance' }
        : {},
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Update a task ───────────────────────────────────────────

const patchTaskSchema = createTaskSchema
  .partial()
  .omit({ departmentId: true })
  .extend({
    // Moving a task between lanes is a reassignment, not an edit, and is
    // restricted to whoever may edit in the destination lane too.
    departmentId: z.string().optional(),
    ownerId: z.string().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    percentComplete: z.number().int().min(0).max(100).optional(),
    actualHours: z.number().nonnegative().optional(),
  })
  .strict()

projectTaskRoutes.patch('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)
    const body = parseOrThrow(patchTaskSchema, req.body)

    // A lane change needs the grant on BOTH sides, or a contributor could push
    // their own work into another department's board unilaterally.
    if (body.departmentId && body.departmentId !== task.departmentId) {
      const participating = project.departments.some((d) => d.departmentId === body.departmentId)
      if (!participating) {
        throw new ValidationError('That department is not participating in this project', {
          departmentId: ['Not a participating department'],
        })
      }
      assertCanEditTask(actor, project, { departmentId: body.departmentId, ownerId: task.ownerId })
    }

    const before = await prisma.task.findUnique({ where: { id: task.id } })
    if (!before) throw new NotFoundError('Task not found')

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          ...body,
          completedAt:
            body.status === 'COMPLETE' && before.status !== 'COMPLETE'
              ? new Date()
              : body.status && body.status !== 'COMPLETE'
                ? null
                : undefined,
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      })

      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        body as Record<string, unknown>,
      )
      if (Object.keys(changes).length) {
        await logActivity(tx, {
          projectId: project.id,
          actorId: actor.id,
          departmentId: next.departmentId,
          entityType: 'TASK',
          entityId: next.id,
          action: 'UPDATED',
          summary: `#${next.taskNumber} "${next.title}" — updated ${Object.keys(changes).join(', ')}`,
          fieldChanges: changes,
        })
      }
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    // Keep the Cowork mirror in step with reassignment (out of band): the new
    // owner starts seeing the project, a removed owner may stop.
    if (body.ownerId !== undefined && body.ownerId !== before.ownerId) {
      if (body.ownerId) syncCoworkAddSafe(prisma, project.id, body.ownerId)
      if (before.ownerId) syncCoworkRemoveSafe(prisma, project.id, before.ownerId)
    }

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Status transition ───────────────────────────────────────

projectTaskRoutes.post('/tasks/:taskId/status', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)
    const body = parseOrThrow(z.object({ status: z.enum(TASK_STATUSES) }).strict(), req.body)

    if (task.acceptanceStatus === 'PENDING') {
      throw new ConflictError(
        'This is a pending cross-department request. Accept it before working on it.',
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          status: body.status,
          completedAt: body.status === 'COMPLETE' ? new Date() : null,
          percentComplete:
            body.status === 'COMPLETE' ? 100 : body.status === 'NOT_STARTED' ? 0 : undefined,
          // Leaving BLOCKED clears the block record; the reason no longer applies.
          blockedReason: body.status === 'BLOCKED' ? undefined : null,
          blockedSince: body.status === 'BLOCKED' ? undefined : null,
        },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'STATUS_CHANGED',
        summary: `#${task.taskNumber} "${task.title}" ${task.status} → ${body.status}`,
        fieldChanges: { status: { from: task.status, to: body.status } },
      })
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    // Closing out a task may have been the owner's last assignment on the
    // project; reconcile the Cowork mirror (out of band).
    if (task.ownerId && (body.status === 'COMPLETE' || body.status === 'CANCELLED')) {
      syncCoworkRemoveSafe(prisma, project.id, task.ownerId)
    }

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Cross-department request: accept / reject ───────────────

projectTaskRoutes.post('/tasks/:taskId/accept', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCan(actor, 'ACCEPT_TASK_REQUEST', project, task)

    if (task.acceptanceStatus !== 'PENDING') {
      throw new ConflictError('This task is not awaiting acceptance')
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { acceptanceStatus: 'ACCEPTED', acceptedAt: new Date() },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'REQUEST_ACCEPTED',
        summary: `Accepted cross-department request #${task.taskNumber} "${task.title}"`,
      })
      // Tell the requester their work was picked up.
      if (task.requestedById) {
        await tx.pulse.create({
          data: {
            type: 'SIGNAL',
            message: `Your request "${task.title}" was accepted.`,
            targetId: task.requestedById,
            metadata: { projectId: project.id, taskId: task.id } as object,
          },
        }).catch(() => {})
      }
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectTaskRoutes.post('/tasks/:taskId/reject', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCan(actor, 'ACCEPT_TASK_REQUEST', project, task)
    // A rejection without a reason is just a wall; the requester needs to know
    // what to do next.
    const body = parseOrThrow(
      z.object({ reason: z.string().min(1).max(2000) }).strict(),
      req.body,
    )

    if (task.acceptanceStatus !== 'PENDING') {
      throw new ConflictError('This task is not awaiting acceptance')
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          acceptanceStatus: 'REJECTED',
          acceptanceNote: body.reason,
          status: 'CANCELLED',
        },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'REQUEST_REJECTED',
        summary: `Rejected request #${task.taskNumber} "${task.title}": ${body.reason}`,
      })
      if (task.requestedById) {
        await tx.pulse.create({
          data: {
            type: 'ALERT',
            message: `Your request "${task.title}" was declined: ${body.reason}`,
            targetId: task.requestedById,
            metadata: { projectId: project.id, taskId: task.id } as object,
          },
        }).catch(() => {})
      }
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Block / unblock ─────────────────────────────────────────

projectTaskRoutes.post('/tasks/:taskId/block', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)
    const body = parseOrThrow(z.object({ reason: z.string().min(1).max(2000) }).strict(), req.body)

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'BLOCKED',
          blockedReason: body.reason,
          // Preserve the original block time if it is already blocked, so the
          // "blocked for N days" ageing the health score depends on is not
          // reset by re-stating the reason.
          blockedSince: task.status === 'BLOCKED' ? undefined : new Date(),
        },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'BLOCKED',
        summary: `#${task.taskNumber} "${task.title}" blocked: ${body.reason}`,
      })
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectTaskRoutes.post('/tasks/:taskId/unblock', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS', blockedReason: null, blockedSince: null },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'UNBLOCKED',
        summary: `#${task.taskNumber} "${task.title}" unblocked`,
      })
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Bulk edit ───────────────────────────────────────────────
// Each task is authorized individually — a bulk endpoint must not become a way
// to edit a lane you could not edit one task at a time.

projectTaskRoutes.post('/tasks/bulk', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const body = parseOrThrow(
      z.object({
        taskIds: z.array(z.string()).min(1).max(MAX_LIMIT),
        patch: z
          .object({
            status: z.enum(TASK_STATUSES).optional(),
            ownerId: z.string().nullable().optional(),
            priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
            dueDate: z.coerce.date().nullable().optional(),
            phaseId: z.string().nullable().optional(),
          })
          .strict(),
      }).strict(),
      req.body,
    )

    if (Object.keys(body.patch).length === 0) {
      throw new ValidationError('No changes supplied', { patch: ['At least one field required'] })
    }

    const updated: string[] = []
    const denied: { taskId: string; reason: string }[] = []

    for (const taskId of body.taskIds) {
      try {
        const { task, project } = await requireTaskWithProject(taskId)
        assertCanEditTask(actor, project, task)
        await prisma.task.update({
          where: { id: taskId },
          data: {
            ...body.patch,
            completedAt: body.patch.status === 'COMPLETE' ? new Date() : undefined,
          },
        })
        updated.push(taskId)
      } catch (err: any) {
        denied.push({ taskId, reason: err?.message ?? 'Not permitted' })
      }
    }

    // 207-style reporting in a 200 body: partial success is the normal outcome
    // of a bulk action across lanes, not an error.
    return ok(res, { updated, denied }, { updated: updated.length, denied: denied.length })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Soft delete ─────────────────────────────────────────────

projectTaskRoutes.delete('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)

    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'DELETED',
        summary: `Deleted #${task.taskNumber} "${task.title}"`,
      })
      await touchProject(tx, project.id)
      scheduleRecompute(prisma, project.id)
    })

    // A deleted task no longer counts as an assignment (out of band).
    if (task.ownerId) syncCoworkRemoveSafe(prisma, project.id, task.ownerId)

    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Dependencies ────────────────────────────────────────────

projectTaskRoutes.post('/tasks/:taskId/dependencies', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)
    const body = parseOrThrow(
      z.object({
        predecessorId: z.string().optional(),
        successorId: z.string().optional(),
        dependencyType: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
        lagDays: z.number().int().default(0),
      })
        .strict()
        .refine((v) => !!v.predecessorId !== !!v.successorId, {
          message: 'Supply exactly one of predecessorId or successorId',
        }),
      req.body,
    )

    // The named task is one end; the body supplies the other.
    const predecessorId = body.predecessorId ?? task.id
    const successorId = body.successorId ?? task.id

    const other = await prisma.task.findUnique({
      where: { id: body.predecessorId ?? body.successorId ?? '' },
      select: { id: true, projectId: true, deletedAt: true },
    })
    if (!other || other.deletedAt) throw new NotFoundError('The other task was not found')
    if (other.projectId !== project.id) {
      throw new ValidationError('Dependencies cannot cross projects', {
        taskId: ['Belongs to a different project'],
      })
    }

    const existing = await prisma.taskDependency.findUnique({
      where: { predecessorId_successorId: { predecessorId, successorId } },
    })
    if (existing) throw new ConflictError('That dependency already exists')

    // Indirect cycles are the ones a DB constraint cannot catch.
    await assertNoCycle(prisma, project.id, predecessorId, successorId)

    const created = await prisma.$transaction(async (tx) => {
      const dep = await tx.taskDependency.create({
        data: { predecessorId, successorId, dependencyType: body.dependencyType, lagDays: body.lagDays },
      })
      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: task.departmentId,
        entityType: 'TASK',
        entityId: task.id,
        action: 'DEPENDENCY_ADDED',
        summary: `Linked #${task.taskNumber} "${task.title}" (${body.dependencyType})`,
      })
      return dep
    })

    return res.status(201).json({ data: created, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectTaskRoutes.delete('/tasks/dependencies/:depId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const dep = await prisma.taskDependency.findUnique({
      where: { id: req.params.depId as string },
      include: { successor: { select: { id: true, projectId: true, departmentId: true, ownerId: true } } },
    })
    if (!dep) throw new NotFoundError('Dependency not found')
    if (!dep.successor.projectId) throw new ConflictError('Dependency is not attached to a project')

    const project = await loadProjectForPolicy(prisma, dep.successor.projectId)
    if (!project) throw new NotFoundError('Project not found')
    assertCanEditTask(actor, project, dep.successor)

    await prisma.taskDependency.delete({ where: { id: dep.id } })
    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Checklist ───────────────────────────────────────────────

projectTaskRoutes.post('/tasks/:taskId/checklist', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const { task, project } = await requireTaskWithProject(req.params.taskId as string)
    assertCanEditTask(actor, project, task)
    const body = parseOrThrow(
      z.object({ label: z.string().min(1).max(500), sortOrder: z.number().int().default(0) }).strict(),
      req.body,
    )

    const item = await prisma.taskChecklistItem.create({
      data: { taskId: task.id, label: body.label, sortOrder: body.sortOrder },
    })
    return res.status(201).json({ data: item, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectTaskRoutes.patch('/tasks/checklist/:itemId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const item = await prisma.taskChecklistItem.findUnique({
      where: { id: req.params.itemId as string },
      include: { task: { select: { id: true, projectId: true, departmentId: true, ownerId: true } } },
    })
    if (!item) throw new NotFoundError('Checklist item not found')
    if (!item.task.projectId) throw new ConflictError('Task is not attached to a project')

    const project = await loadProjectForPolicy(prisma, item.task.projectId)
    if (!project) throw new NotFoundError('Project not found')
    assertCanEditTask(actor, project, item.task)

    const body = parseOrThrow(
      z.object({
        label: z.string().min(1).max(500).optional(),
        isDone: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }).strict(),
      req.body,
    )

    const updated = await prisma.taskChecklistItem.update({ where: { id: item.id }, data: body })
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

export default projectTaskRoutes

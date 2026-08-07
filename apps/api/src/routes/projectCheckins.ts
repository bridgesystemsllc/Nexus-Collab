import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { checkinDueAt, nextCheckinAt, formatEt, type Cadence } from '../services/projects/cadence'
import { runCheckinEngine, ensureCheckinSchedule } from '../services/projects/checkinEngine'
import { logActivity, touchProject } from '../services/projects/activity'
import { scheduleRecompute } from '../services/projects/recompute'

export const projectCheckinRoutes: ReturnType<typeof Router> = Router()

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

// ─── My pending check-ins ────────────────────────────────────
// Registered before /:id so "checkins" is never read as a project id.

projectCheckinRoutes.get('/checkins/my/pending', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const rows = await prisma.projectCheckin.findMany({
      where: {
        respondentId: actor.id,
        status: { in: ['PENDING', 'OVERDUE'] },
        project: { is: { deletedAt: null } },
      },
      orderBy: { dueAt: 'asc' },
      include: {
        project: { select: { id: true, projectNumber: true, title: true, healthBand: true } },
        department: { select: { id: true, code: true, name: true, color: true } },
      },
      take: 50,
    })
    return ok(res, rows, { total: rows.length })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Manually run the engine ─────────────────────────────────
// Exposed so the schedule can be exercised without waiting an hour, and so a
// missed cron run can be caught up deliberately. Admin-only.

projectCheckinRoutes.post('/checkins/run-engine', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    if (actor.role !== 'ADMIN' && actor.role !== 'OPS_MANAGER') {
      return res.status(403).json({
        error: { code: 'PolicyError', message: 'Requires ADMIN or OPS_MANAGER' },
      })
    }
    const result = await runCheckinEngine(prisma)
    return ok(res, result)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Respond to a check-in ───────────────────────────────────
// Four fields. Anything longer does not get filled out, which is why the
// schema refuses to grow.

projectCheckinRoutes.post('/checkins/:checkinId/respond', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const checkin = await prisma.projectCheckin.findUnique({
      where: { id: req.params.checkinId as string },
      include: { department: { select: { name: true } } },
    })
    if (!checkin) throw new NotFoundError('Check-in not found')

    const project = await requireProject(checkin.projectId)
    assertCan(actor, 'RESPOND_CHECKIN', project)

    if (checkin.status === 'RESPONDED') {
      throw new ConflictError('This check-in has already been answered')
    }

    const body = parseOrThrow(
      z.object({
        progressSummary: z.string().max(4000).optional(),
        blockers: z.string().max(4000).optional(),
        needsFromOthers: z.string().max(4000).optional(),
        confidence: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']),
      }).strict(),
      req.body,
    )

    const updated = await prisma.projectCheckin.update({
      where: { id: checkin.id },
      data: {
        ...body,
        status: 'RESPONDED',
        respondedAt: new Date(),
        // Whoever actually answers is recorded, which may not be who was asked.
        respondentId: actor.id,
      },
    })

    await logActivity(prisma, {
      projectId: checkin.projectId,
      actorId: actor.id,
      departmentId: checkin.departmentId,
      entityType: 'CHECKIN',
      entityId: checkin.id,
      action: 'RESPONDED',
      summary:
        `${checkin.department?.name ?? 'All hands'} check-in: ${body.confidence.replace(/_/g, ' ').toLowerCase()}` +
        (body.blockers?.trim() ? ` — blockers reported` : ''),
    })
    await touchProject(prisma, checkin.projectId)
    // A reported blocker changes the picture; recompute rather than waiting
    // for the nightly sweep.
    scheduleRecompute(prisma, checkin.projectId)

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Check-ins on a project ──────────────────────────────────

projectCheckinRoutes.get('/:id/checkins', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)

    const q = parseOrThrow(
      z.object({
        departmentId: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).default(50),
      }),
      req.query,
    )

    const rows = await prisma.projectCheckin.findMany({
      where: {
        projectId: project.id,
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.status ? { status: { in: q.status.split(',') } } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: q.limit,
      include: {
        department: { select: { id: true, code: true, name: true, color: true } },
        respondent: { select: { id: true, name: true, avatar: true } },
      },
    })

    // Compliance per department: answered vs asked. This is the number that
    // tells a PM which lane is actually engaging.
    const byDept = new Map<string, { name: string; asked: number; answered: number }>()
    for (const c of rows) {
      const key = c.departmentId ?? 'all-hands'
      const entry = byDept.get(key) ?? {
        name: c.department?.name ?? 'All hands', asked: 0, answered: 0,
      }
      entry.asked++
      if (c.status === 'RESPONDED') entry.answered++
      byDept.set(key, entry)
    }

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      select: { checkinCadence: true, checkinDayOfWeek: true, nextCheckinAt: true },
    })

    return ok(res, rows, {
      total: rows.length,
      cadence: full?.checkinCadence,
      nextCheckinAt: full?.nextCheckinAt,
      nextCheckinLabel: full?.nextCheckinAt ? formatEt(full.nextCheckinAt) : null,
      compliance: [...byDept.entries()].map(([departmentId, v]) => ({
        departmentId,
        department: v.name,
        asked: v.asked,
        answered: v.answered,
        rate: v.asked > 0 ? Math.round((v.answered / v.asked) * 100) : 0,
      })),
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Request a check-in now ──────────────────────────────────

projectCheckinRoutes.post('/:id/checkins/request', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    // Asking the whole project for a status update is a PM action.
    assertCan(actor, 'EDIT_PROJECT', project)

    const body = parseOrThrow(
      z.object({ departmentIds: z.array(z.string()).optional() }).strict(),
      req.body ?? {},
    )

    const lanes = await prisma.projectDepartment.findMany({
      where: {
        projectId: project.id,
        ...(body.departmentIds?.length ? { departmentId: { in: body.departmentIds } } : {}),
      },
      include: { department: { select: { name: true } } },
    })
    if (lanes.length === 0) {
      throw new ValidationError('No participating departments to ask', {
        departmentIds: ['None matched'],
      })
    }

    const now = new Date()
    const dueAt = checkinDueAt(now)
    const full = await prisma.project.findUnique({
      where: { id: project.id },
      select: { projectManagerId: true, projectNumber: true, title: true },
    })

    const created: string[] = []
    const skipped: string[] = []

    for (const lane of lanes) {
      const respondentId = lane.laneLeadId ?? full?.projectManagerId ?? null
      try {
        const row = await prisma.projectCheckin.create({
          data: {
            projectId: project.id,
            departmentId: lane.departmentId,
            requestedAt: now,
            dueAt,
            status: 'PENDING',
            respondentId,
          },
        })
        created.push(row.id)
        if (respondentId) {
          await prisma.pulse.create({
            data: {
              type: 'SIGNAL',
              message:
                `Check-in requested for ${full?.projectNumber ?? full?.title}` +
                ` (${lane.department.name}) — due ${formatEt(dueAt)}.`,
              deptName: 'Projects',
              targetId: respondentId,
              metadata: { projectId: project.id } as object,
            },
          }).catch(() => {})
        }
      } catch (err: any) {
        // Same idempotency guarantee as the engine: an identical request in
        // the same window is a no-op, not an error.
        if (err?.code === 'P2002') { skipped.push(lane.department.name); continue }
        throw err
      }
    }

    await logActivity(prisma, {
      projectId: project.id,
      actorId: actor.id,
      entityType: 'CHECKIN',
      action: 'REQUESTED',
      summary: `Manual check-in requested from ${created.length} department(s)`,
    })

    return res.status(201).json({
      data: { created: created.length, skipped },
      meta: {
        dueAt,
        dueLabel: formatEt(dueAt),
        ...(skipped.length ? { note: `Already requested for: ${skipped.join(', ')}` } : {}),
      },
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Set or repair the cadence schedule ──────────────────────

projectCheckinRoutes.post('/:id/checkins/schedule', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)

    const body = parseOrThrow(
      z.object({
        cadence: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'NONE']).optional(),
        dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
      }).strict(),
      req.body ?? {},
    )

    const now = new Date()
    const current = await prisma.project.findUnique({
      where: { id: project.id },
      select: { checkinCadence: true, checkinDayOfWeek: true },
    })

    const cadence = (body.cadence ?? current?.checkinCadence ?? 'WEEKLY') as Cadence
    const dayOfWeek = body.dayOfWeek !== undefined ? body.dayOfWeek : current?.checkinDayOfWeek

    const next = nextCheckinAt(cadence, dayOfWeek, now)
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { checkinCadence: cadence, checkinDayOfWeek: dayOfWeek ?? null, nextCheckinAt: next },
      select: { checkinCadence: true, checkinDayOfWeek: true, nextCheckinAt: true },
    })

    return ok(res, updated, { nextCheckinLabel: next ? formatEt(next) : null })
  } catch (err) {
    return fail(res, err)
  }
})

// Seed a schedule for a project that has none. Idempotent.
projectCheckinRoutes.post('/:id/checkins/ensure-schedule', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', project)
    const next = await ensureCheckinSchedule(prisma, project.id)
    return ok(res, { nextCheckinAt: next }, { nextCheckinLabel: next ? formatEt(next) : null })
  } catch (err) {
    return fail(res, err)
  }
})

export default projectCheckinRoutes

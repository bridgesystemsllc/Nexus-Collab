import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { assertCan, can, PolicyError, type PolicyActor, type PolicyProject } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, visibilityWhere, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { allocateProjectNumber } from '../services/projects/numbering'
import { applyTemplate } from '../services/projects/template'
import { logActivity, diffFields, touchProject } from '../services/projects/activity'
import { splitByTier } from '../services/projects/fieldTiers'
import { projectCapabilities } from '../services/projects/capabilities'
import { syncCoworkAddSafe, syncCoworkAddManySafe, syncCoworkRemoveSafe } from '../services/projects/coworkSync'

export const projectRoutes: ReturnType<typeof Router> = Router()

// ─── Shared helpers ──────────────────────────────────────────

const MAX_LIMIT = 100

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(25),
})

function ok(res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return res.json({ data, meta })
}

function fail(res: Response, err: unknown) {
  const { status, body } = errorResponse(err)
  return res.status(status).json(body)
}

// zod errors become 422 with field-level detail, per the API contract.
function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ValidationError('Validation failed', result.error.flatten())
  }
  return result.data
}

// Load a project for policy or 404. Used by every :id route so a project the
// actor cannot see is indistinguishable from one that does not exist.
//
// A soft-deleted project is reported as missing rather than forbidden: a 403
// would confirm to an unauthorized caller that the record exists. The policy's
// own deletedAt check stays in place as defense-in-depth for any future caller
// that does not come through here.
async function requireProject(projectId: string): Promise<PolicyProject> {
  const project = await loadProjectForPolicy(prisma, projectId)
  if (!project || project.deletedAt) throw new NotFoundError('Project not found')
  return project
}

/** Which department lane is this actor acting in for the given project? */
function defaultLane(actor: PolicyActor, project: PolicyProject): string | null {
  if (actor.departmentId) {
    const inLane = project.departments.some((d) => d.departmentId === actor.departmentId)
    if (inLane) return actor.departmentId
  }
  return project.ownerDepartmentId ?? null
}

// ─── Reference data ──────────────────────────────────────────

projectRoutes.get('/meta/departments', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const departments = await prisma.department.findMany({
      where: { orgId: actor.orgId, archived: false },
      select: { id: true, code: true, name: true, color: true, icon: true },
      orderBy: { name: 'asc' },
    })
    return ok(res, departments, { total: departments.length })
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.get('/meta/types', async (_req: Request, res: Response) => {
  try {
    const types = await prisma.projectType.findMany({
      where: { isActive: true },
      include: { defaultDepartment: { select: { id: true, code: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    })
    return ok(res, types, { total: types.length })
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.get('/meta/templates', async (req: Request, res: Response) => {
  try {
    const q = parseOrThrow(
      z.object({ typeId: z.string().optional(), departmentId: z.string().optional() }),
      req.query,
    )
    const templates = await prisma.projectTemplate.findMany({
      where: {
        isActive: true,
        ...(q.typeId ? { projectTypeId: q.typeId } : {}),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      },
      select: {
        id: true, name: true, description: true, projectTypeId: true, departmentId: true,
      },
      orderBy: { name: 'asc' },
    })
    return ok(res, templates, { total: templates.length })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: list ──────────────────────────────────────────

const listQuerySchema = paginationSchema.extend({
  departmentId: z.string().optional(),
  status: z.string().optional(),
  health: z.enum(['GREEN', 'AMBER', 'RED']).optional(),
  typeId: z.string().optional(),
  pmId: z.string().optional(),
  brand: z.string().optional(),
  retailer: z.string().optional(),
  priority: z.string().optional(),
  search: z.string().optional(),
  dueBefore: z.coerce.date().optional(),
  // When scoped to a department, include projects it merely participates in
  // rather than only the ones it owns. This is what makes one project appear
  // in several departments' tabs without being copied.
  includeParticipating: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(true),
  sort: z.enum(['recent', 'health', 'dueDate', 'title']).default('recent'),
})

projectRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(listQuerySchema, req.query)

    const where: Record<string, unknown> = { ...visibilityWhere(actor) }
    const and: Record<string, unknown>[] = []

    if (q.departmentId) {
      and.push(
        q.includeParticipating
          ? {
              OR: [
                { ownerDepartmentId: q.departmentId },
                { departments: { some: { departmentId: q.departmentId } } },
              ],
            }
          : { ownerDepartmentId: q.departmentId },
      )
    }
    if (q.status) and.push({ status: { in: q.status.split(',') } })
    if (q.health) and.push({ healthBand: q.health })
    if (q.typeId) and.push({ projectTypeId: q.typeId })
    if (q.pmId) and.push({ projectManagerId: q.pmId })
    if (q.priority) and.push({ priority: { in: q.priority.split(',') } })
    if (q.brand) and.push({ brands: { has: q.brand } })
    if (q.retailer) and.push({ retailers: { has: q.retailer } })
    if (q.dueBefore) and.push({ targetEndDate: { lte: q.dueBefore } })
    if (q.search) {
      and.push({
        OR: [
          { title: { contains: q.search, mode: 'insensitive' } },
          { projectNumber: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } },
        ],
      })
    }
    if (and.length) where.AND = and

    const orderBy =
      q.sort === 'health' ? { health: 'asc' as const }
      : q.sort === 'dueDate' ? { targetEndDate: 'asc' as const }
      : q.sort === 'title' ? { title: 'asc' as const }
      : { updatedAt: 'desc' as const }

    // Fixed query count regardless of result size: one count, one page fetch
    // with every display field included. No per-row follow-ups.
    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          projectType: { select: { id: true, code: true, label: true, icon: true } },
          ownerDepartment: { select: { id: true, code: true, name: true, color: true } },
          projectManager: { select: { id: true, name: true, avatar: true } },
          departments: {
            select: {
              departmentId: true, role: true,
              department: { select: { id: true, code: true, name: true, color: true } },
            },
          },
          members: {
            select: {
              memberId: true, role: true,
              member: { select: { id: true, name: true, avatar: true } },
            },
          },
          _count: { select: { tasks: { where: { deletedAt: null } } } },
        },
      }),
    ])

    return ok(res, projects, {
      total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) || 1,
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: read one ──────────────────────────────────────

projectRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', policyProject)

    const project = await prisma.project.findUnique({
      where: { id: policyProject.id },
      include: {
        projectType: true,
        ownerDepartment: { select: { id: true, code: true, name: true, color: true } },
        projectManager: { select: { id: true, name: true, avatar: true, email: true } },
        executiveSponsor: { select: { id: true, name: true, avatar: true } },
        departments: {
          include: {
            department: { select: { id: true, code: true, name: true, color: true } },
            laneLead: { select: { id: true, name: true, avatar: true } },
          },
        },
        members: {
          include: {
            member: { select: { id: true, name: true, avatar: true, email: true } },
            department: { select: { id: true, code: true, name: true } },
          },
        },
        moduleLinks: true,
        collabLinks: {
          where: { unlinkedAt: null },
          include: { coworkSpace: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
            milestones: true,
            risks: { where: { status: { in: ['OPEN', 'MITIGATING'] } } },
          },
        },
      },
    })

    return ok(res, project && { ...project, capabilities: projectCapabilities(actor, policyProject) })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: create ────────────────────────────────────────

const createProjectSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(10_000).optional(),
    businessCase: z.string().max(10_000).optional(),
    successCriteria: z.string().max(10_000).optional(),
    projectTypeId: z.string(),
    ownerDepartmentId: z.string(),
    projectManagerId: z.string().optional(),
    executiveSponsorId: z.string().optional(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
    status: z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE']).default('DRAFT'),
    brands: z.array(z.string()).default([]),
    retailers: z.array(z.string()).default([]),
    markets: z.array(z.string()).default([]),
    startDate: z.coerce.date().optional(),
    targetEndDate: z.coerce.date().optional(),
    budgetAmount: z.number().nonnegative().optional(),
    currency: z.string().length(3).default('USD'),
    customFields: z.record(z.unknown()).default({}),
    checkinCadence: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'NONE']).default('WEEKLY'),
    checkinDayOfWeek: z.number().int().min(1).max(7).optional(),
    isConfidential: z.boolean().default(false),
    templateId: z.string().optional(),
    participatingDepartments: z
      .array(
        z.object({
          departmentId: z.string(),
          role: z.enum(['CONTRIBUTOR', 'REVIEWER', 'VIEWER']).default('CONTRIBUTOR'),
          laneLeadId: z.string().optional(),
        }),
      )
      .default([]),
    // Individual people assigned at creation. Each represents a department
    // (their own by default) on this project.
    members: z
      .array(
        z.object({
          memberId: z.string(),
          role: z.enum(['LANE_LEAD', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER']).default('CONTRIBUTOR'),
          departmentId: z.string().optional(),
        }),
      )
      .default([]),
  })
  .strict() // reject unknown fields rather than silently dropping them

projectRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    assertCan(actor, 'CREATE_PROJECT')
    const body = parseOrThrow(createProjectSchema, req.body)

    const [type, ownerDept] = await Promise.all([
      prisma.projectType.findUnique({ where: { id: body.projectTypeId } }),
      prisma.department.findUnique({ where: { id: body.ownerDepartmentId } }),
    ])
    if (!type) throw new ValidationError('Unknown project type', { projectTypeId: ['Not found'] })
    if (!ownerDept || ownerDept.orgId !== actor.orgId) {
      throw new ValidationError('Unknown department', { ownerDepartmentId: ['Not found'] })
    }

    // Type-specific required fields, declared as data on the type.
    const missing = type.requiredFields.filter((f) => {
      const fromBody = (body as Record<string, unknown>)[f]
      const fromCustom = (body.customFields as Record<string, unknown>)[f]
      const value = fromBody ?? fromCustom
      return value == null || (Array.isArray(value) && value.length === 0) || value === ''
    })
    if (missing.length) {
      throw new ValidationError(
        `${type.label} requires: ${missing.join(', ')}`,
        Object.fromEntries(missing.map((f) => [f, ['Required for this project type']])),
      )
    }

    if (body.templateId) {
      const tpl = await prisma.projectTemplate.findUnique({ where: { id: body.templateId } })
      if (!tpl) throw new ValidationError('Unknown template', { templateId: ['Not found'] })
    }

    const startDate = body.startDate ?? new Date()

    const created = await prisma.$transaction(async (tx) => {
      const projectNumber = await allocateProjectNumber(tx, actor.orgId)

      const project = await tx.project.create({
        data: {
          projectNumber,
          title: body.title,
          description: body.description ?? null,
          businessCase: body.businessCase ?? null,
          successCriteria: body.successCriteria ?? null,
          projectTypeId: body.projectTypeId,
          ownerDepartmentId: body.ownerDepartmentId,
          projectManagerId: body.projectManagerId ?? actor.id,
          executiveSponsorId: body.executiveSponsorId ?? null,
          status: body.status,
          priority: body.priority,
          brands: body.brands,
          retailers: body.retailers,
          markets: body.markets,
          startDate,
          targetEndDate: body.targetEndDate ?? null,
          budgetAmount: body.budgetAmount ?? null,
          currency: body.currency,
          customFields: body.customFields as object,
          checkinCadence: body.checkinCadence,
          checkinDayOfWeek: body.checkinDayOfWeek ?? null,
          isConfidential: body.isConfidential,
          orgId: actor.orgId,
          createdById: actor.id,
          lastActivityAt: new Date(),
        },
      })

      // The owning department is always a participant, with OWNER role.
      await tx.projectDepartment.create({
        data: {
          projectId: project.id,
          departmentId: body.ownerDepartmentId,
          role: 'OWNER',
          laneLeadId: body.projectManagerId ?? actor.id,
        },
      })

      for (const d of body.participatingDepartments) {
        if (d.departmentId === body.ownerDepartmentId) continue // already added as OWNER
        await tx.projectDepartment.create({
          data: {
            projectId: project.id,
            departmentId: d.departmentId,
            role: d.role,
            laneLeadId: d.laneLeadId ?? null,
          },
        })
      }

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          memberId: body.projectManagerId ?? actor.id,
          role: 'PROJECT_MANAGER',
          departmentId: body.ownerDepartmentId,
        },
      })

      // Individual people picked in the wizard. Each represents a department —
      // theirs by default when none was chosen explicitly.
      const pmId = body.projectManagerId ?? actor.id
      for (const m of body.members) {
        if (m.memberId === pmId) continue // already added as PROJECT_MANAGER
        const person = await tx.member.findUnique({ where: { id: m.memberId } })
        if (!person || person.orgId !== actor.orgId) {
          throw new ValidationError('Unknown member', { members: [`${m.memberId}: not found`] })
        }
        if (m.departmentId) {
          const dept = await tx.department.findUnique({ where: { id: m.departmentId } })
          if (!dept || dept.orgId !== actor.orgId) {
            throw new ValidationError('Unknown department', { members: [`${m.memberId}: bad department`] })
          }
        }
        await tx.projectMember.create({
          data: {
            projectId: project.id,
            memberId: m.memberId,
            role: m.role,
            departmentId: m.departmentId ?? person.departmentId,
          },
        })
      }

      let templateResult = null
      if (body.templateId) {
        const tpl = await tx.projectTemplate.findUnique({ where: { id: body.templateId } })
        if (tpl) {
          templateResult = await applyTemplate(tx, {
            projectId: project.id,
            definition: tpl.definition,
            startDate,
            fallbackDepartmentId: body.ownerDepartmentId,
            createdById: actor.id,
          })
        }
      }

      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        departmentId: body.ownerDepartmentId,
        entityType: 'PROJECT',
        entityId: project.id,
        action: 'CREATED',
        summary: `${projectNumber} "${body.title}" created`,
      })

      return { project, templateResult }
    })

    // Mirror the whole initial roster — the effective PM plus explicit picks —
    // into the project's cowork space in one awaited batch (single space
    // creation, no per-member race). Non-fatal: the create already succeeded.
    await syncCoworkAddManySafe(prisma, created.project.id, [
      body.projectManagerId ?? actor.id,
      ...body.members.map((m) => m.memberId),
    ])

    return res.status(201).json({
      data: created.project,
      meta: created.templateResult ? { template: created.templateResult } : {},
    })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: update ────────────────────────────────────────

const patchProjectSchema = createProjectSchema
  .omit({ templateId: true, participatingDepartments: true, members: true, projectTypeId: true, ownerDepartmentId: true })
  .partial()
  .extend({
    projectTypeId: z.string().optional(),
    targetEndDate: z.coerce.date().nullable().optional(),
    actualEndDate: z.coerce.date().nullable().optional(),
    lessonsLearned: z.string().max(10_000).optional(),
    // .partial() above only makes these optional, not nullable — the base
    // schema's .optional() fields still reject an explicit null. These four
    // columns are genuinely nullable (String? / DateTime? in schema.prisma),
    // so a client clearing the field must be able to send null and have it
    // stick. `title` is deliberately excluded: the column is non-null and a
    // project must always have a title.
    description: z.string().max(10_000).nullable().optional(),
    businessCase: z.string().max(10_000).nullable().optional(),
    successCriteria: z.string().max(10_000).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
  })
  .strict()

projectRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'EDIT_PROJECT', policyProject)
    const body = parseOrThrow(patchProjectSchema, req.body)

    // EDIT_PROJECT is open to any non-viewer participant, but governance
    // fields are not. Reject the whole request naming the offending fields —
    // dropping them silently looks like a save that worked.
    const tiers = splitByTier(body as Record<string, unknown>)
    if (Object.keys(tiers.governance).length > 0) {
      if (!can(actor, 'SET_BASELINE', policyProject).allowed) {
        throw new PolicyError(
          `Only the project manager or an admin can change: ${Object.keys(tiers.governance).sort().join(', ')}`,
        )
      }
    }

    // status has its own transition endpoint with its own rules; anything else
    // here is a field nobody classified. Both fail closed — fieldTiers.ts
    // promises exactly this.
    if (tiers.unrecognised.length > 0) {
      throw new ValidationError('These fields cannot be set here', {
        fields: tiers.unrecognised.sort(),
      })
    }

    const before = await prisma.project.findUnique({ where: { id: policyProject.id } })
    if (!before) throw new NotFoundError('Project not found')

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.project.update({
        where: { id: policyProject.id },
        data: {
          ...body,
          customFields: body.customFields ? (body.customFields as object) : undefined,
          lastActivityAt: new Date(),
        },
      })

      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        body as Record<string, unknown>,
      )
      if (Object.keys(changes).length) {
        await logActivity(tx, {
          projectId: next.id,
          actorId: actor.id,
          departmentId: defaultLane(actor, policyProject),
          entityType: 'PROJECT',
          entityId: next.id,
          action: 'UPDATED',
          summary: `Updated ${Object.keys(changes).join(', ')}`,
          fieldChanges: changes,
        })
      }
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: status transition ─────────────────────────────

const PROJECT_STATUSES = [
  'DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'ON_HOLD', 'AT_RISK',
  'BLOCKED', 'COMPLETED', 'CANCELLED', 'ARCHIVED',
] as const

projectRoutes.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    const body = parseOrThrow(
      z.object({ status: z.enum(PROJECT_STATUSES), reason: z.string().max(2000).optional() }).strict(),
      req.body,
    )

    // Archiving and cancelling are a heavier grant than a routine status move.
    const action = body.status === 'ARCHIVED' || body.status === 'CANCELLED'
      ? 'ARCHIVE_PROJECT'
      : 'EDIT_PROJECT'
    assertCan(actor, action, policyProject)

    const before = await prisma.project.findUnique({ where: { id: policyProject.id } })
    if (!before) throw new NotFoundError('Project not found')

    // Closeout requires a retrospective. Enforced here rather than in the UI
    // so an archived project always carries one.
    if (body.status === 'ARCHIVED' && !before.lessonsLearned?.trim()) {
      throw new ConflictError('Record lessons learned before archiving this project')
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.project.update({
        where: { id: policyProject.id },
        data: {
          status: body.status,
          actualEndDate:
            body.status === 'COMPLETED' && !before.actualEndDate ? new Date() : undefined,
          lastActivityAt: new Date(),
        },
      })
      await logActivity(tx, {
        projectId: next.id,
        actorId: actor.id,
        departmentId: defaultLane(actor, policyProject),
        entityType: 'PROJECT',
        entityId: next.id,
        action: 'STATUS_CHANGED',
        summary: `Status ${before.status} → ${body.status}${body.reason ? `: ${body.reason}` : ''}`,
        fieldChanges: { status: { from: before.status, to: body.status } },
      })
      return next
    })

    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: freeze baseline ───────────────────────────────
// Slip is only meaningful against a plan someone committed to, so the baseline
// is frozen once, explicitly, and never moves on its own afterwards.

projectRoutes.post('/:id/baseline', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'SET_BASELINE', policyProject)
    const body = parseOrThrow(z.object({ force: z.boolean().default(false) }).strict(), req.body ?? {})

    const project = await prisma.project.findUnique({ where: { id: policyProject.id } })
    if (!project) throw new NotFoundError('Project not found')

    if (!['APPROVED', 'ACTIVE'].includes(project.status)) {
      throw new ConflictError(
        `A baseline can only be set on an APPROVED or ACTIVE project (currently ${project.status})`,
      )
    }
    if (project.baselinedAt && !body.force) {
      throw new ConflictError(
        'This project already has a baseline. Re-baselining hides prior slip — pass force to confirm.',
      )
    }
    if (!project.targetEndDate) {
      throw new ConflictError('Set a target end date before baselining')
    }

    const result = await prisma.$transaction(async (tx) => {
      const next = await tx.project.update({
        where: { id: project.id },
        data: {
          baselineEndDate: project.targetEndDate,
          baselinedAt: new Date(),
          lastActivityAt: new Date(),
        },
      })

      // Phases and milestones baseline together with the project; a partial
      // baseline would make phase-level slip incomparable to project slip.
      const phases = await tx.projectPhase.findMany({ where: { projectId: project.id } })
      for (const p of phases) {
        await tx.projectPhase.update({
          where: { id: p.id },
          data: { baselineStart: p.startDate, baselineEnd: p.endDate },
        })
      }
      const milestones = await tx.projectMilestone.findMany({ where: { projectId: project.id } })
      for (const m of milestones) {
        await tx.projectMilestone.update({ where: { id: m.id }, data: { baselineDate: m.dueDate } })
      }

      await logActivity(tx, {
        projectId: project.id,
        actorId: actor.id,
        entityType: 'PROJECT',
        entityId: project.id,
        action: 'BASELINED',
        summary: `Baseline frozen at ${project.targetEndDate?.toISOString().slice(0, 10)}` +
          ` (${phases.length} phases, ${milestones.length} milestones)`,
      })

      return { project: next, phases: phases.length, milestones: milestones.length }
    })

    return ok(res, result.project, { phases: result.phases, milestones: result.milestones })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Projects: soft delete ───────────────────────────────────

projectRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ARCHIVE_PROJECT', policyProject)

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: policyProject.id },
        data: { deletedAt: new Date() },
      })
      await logActivity(tx, {
        projectId: policyProject.id,
        actorId: actor.id,
        entityType: 'PROJECT',
        entityId: policyProject.id,
        action: 'DELETED',
        summary: 'Project deleted',
      })
    })

    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Participating departments ───────────────────────────────

projectRoutes.get('/:id/departments', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', policyProject)

    const rows = await prisma.projectDepartment.findMany({
      where: { projectId: policyProject.id },
      include: {
        department: { select: { id: true, code: true, name: true, color: true } },
        laneLead: { select: { id: true, name: true, avatar: true } },
      },
    })
    return ok(res, rows, { total: rows.length })
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.post('/:id/departments', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject)
    const body = parseOrThrow(
      z.object({
        departmentId: z.string(),
        role: z.enum(['CONTRIBUTOR', 'REVIEWER', 'VIEWER']).default('CONTRIBUTOR'),
        laneLeadId: z.string().optional(),
      }).strict(),
      req.body,
    )

    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } })
    if (!dept || dept.orgId !== actor.orgId) {
      throw new ValidationError('Unknown department', { departmentId: ['Not found'] })
    }
    const exists = await prisma.projectDepartment.findUnique({
      where: { projectId_departmentId: { projectId: policyProject.id, departmentId: body.departmentId } },
    })
    if (exists) throw new ConflictError(`${dept.name} is already participating in this project`)

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.projectDepartment.create({
        data: {
          projectId: policyProject.id,
          departmentId: body.departmentId,
          role: body.role,
          laneLeadId: body.laneLeadId ?? null,
        },
        include: { department: { select: { id: true, code: true, name: true } } },
      })
      await logActivity(tx, {
        projectId: policyProject.id,
        actorId: actor.id,
        departmentId: body.departmentId,
        entityType: 'PROJECT',
        entityId: policyProject.id,
        action: 'DEPARTMENT_ADDED',
        summary: `${dept.name} joined as ${body.role.toLowerCase()}`,
      })
      await touchProject(tx, policyProject.id)
      return row
    })

    return res.status(201).json({ data: created, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.patch('/:id/departments/:deptId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject)
    const body = parseOrThrow(
      z.object({
        role: z.enum(['OWNER', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER']).optional(),
        laneLeadId: z.string().nullable().optional(),
      }).strict(),
      req.body,
    )

    const updated = await prisma.projectDepartment.update({
      where: {
        projectId_departmentId: {
          projectId: policyProject.id,
          departmentId: req.params.deptId as string,
        },
      },
      data: body,
      include: { department: { select: { id: true, code: true, name: true } } },
    })
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.delete('/:id/departments/:deptId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject)
    const departmentId = req.params.deptId as string

    if (policyProject.ownerDepartmentId === departmentId) {
      throw new ConflictError(
        'The owning department cannot be removed. Transfer ownership first.',
      )
    }

    // Removing a lane whose tasks are still open would orphan work with no
    // visible owner, so it is refused rather than silently detaching them.
    const openTasks = await prisma.task.count({
      where: {
        projectId: policyProject.id, departmentId, deletedAt: null,
        status: { notIn: ['COMPLETE', 'CANCELLED'] },
      },
    })
    if (openTasks > 0) {
      throw new ConflictError(
        `That department still has ${openTasks} open task(s) on this project. Reassign or close them first.`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectDepartment.delete({
        where: { projectId_departmentId: { projectId: policyProject.id, departmentId } },
      })
      await logActivity(tx, {
        projectId: policyProject.id,
        actorId: actor.id,
        departmentId,
        entityType: 'PROJECT',
        entityId: policyProject.id,
        action: 'DEPARTMENT_REMOVED',
        summary: 'Department removed from project',
      })
    })

    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Members ─────────────────────────────────────────────────

projectRoutes.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', policyProject)

    const rows = await prisma.projectMember.findMany({
      where: { projectId: policyProject.id },
      include: {
        member: { select: { id: true, name: true, avatar: true, email: true, role: true } },
        department: { select: { id: true, code: true, name: true } },
      },
    })
    return ok(res, rows, { total: rows.length })
  } catch (err) {
    return fail(res, err)
  }
})

const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER', 'LANE_LEAD', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER', 'SPONSOR',
] as const

projectRoutes.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject) // same grant as team changes
    const body = parseOrThrow(
      z.object({
        memberId: z.string(),
        role: z.enum(PROJECT_MEMBER_ROLES).default('CONTRIBUTOR'),
        departmentId: z.string().optional(),
        isWatcher: z.boolean().default(false),
      }).strict(),
      req.body,
    )

    const member = await prisma.member.findUnique({ where: { id: body.memberId } })
    if (!member || member.orgId !== actor.orgId) {
      throw new ValidationError('Unknown member', { memberId: ['Not found'] })
    }
    if (body.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: body.departmentId } })
      if (!dept || dept.orgId !== actor.orgId) {
        throw new ValidationError('Unknown department', { departmentId: ['Not found'] })
      }
    }

    const created = await prisma.projectMember.upsert({
      where: { projectId_memberId: { projectId: policyProject.id, memberId: body.memberId } },
      create: {
        projectId: policyProject.id,
        memberId: body.memberId,
        role: body.role,
        departmentId: body.departmentId ?? member.departmentId,
        isWatcher: body.isWatcher,
      },
      update: { role: body.role, departmentId: body.departmentId ?? undefined, isWatcher: body.isWatcher },
      include: { member: { select: { id: true, name: true, avatar: true } } },
    })

    // Surface their project work in Cowork Spaces (out of band, never blocks).
    syncCoworkAddSafe(prisma, policyProject.id, body.memberId)

    return res.status(201).json({ data: created, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.patch('/:id/members/:memberId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject)
    const body = parseOrThrow(
      z.object({
        role: z.enum(PROJECT_MEMBER_ROLES).optional(),
        departmentId: z.string().nullable().optional(),
        isWatcher: z.boolean().optional(),
      }).strict(),
      req.body,
    )

    const updated = await prisma.projectMember.update({
      where: {
        projectId_memberId: {
          projectId: policyProject.id,
          memberId: req.params.memberId as string,
        },
      },
      data: body,
    })
    return ok(res, updated)
  } catch (err) {
    return fail(res, err)
  }
})

projectRoutes.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const policyProject = await requireProject(req.params.id as string)
    assertCan(actor, 'ADD_DEPARTMENT', policyProject)
    const memberId = req.params.memberId as string

    if (policyProject.projectManagerId === memberId) {
      throw new ConflictError('Assign a new project manager before removing this one')
    }

    await prisma.projectMember.delete({
      where: { projectId_memberId: { projectId: policyProject.id, memberId } },
    })

    // If that was their last assignment on the project, stop surfacing it in
    // Cowork for them (out of band, never blocks).
    syncCoworkRemoveSafe(prisma, policyProject.id, memberId)

    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Activity feed (§5) ──────────────────────────────────────
// Every phase of this module writes to ProjectActivity — creations, status
// changes, band drops, check-in escalations, collab links, report publishes.
// Until now nothing read it back, so a complete audit trail sat in the database
// with no way to see it.
//
// Cursor-paginated on createdAt rather than offset-paginated: the feed grows at
// the head, and an offset page 2 fetched a second later silently repeats rows
// that the new entries pushed down.

projectRoutes.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const project = await requireProject(req.params.id as string)
    assertCan(actor, 'VIEW_PROJECT', project)

    const q = parseOrThrow(
      z.object({
        limit: z.coerce.number().int().positive().max(100).default(50),
        before: z.coerce.date().optional(),
        entityType: z.string().optional(),
        departmentId: z.string().optional(),
      }),
      req.query,
    )

    const rows = await prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        ...(q.before ? { createdAt: { lt: q.before } } : {}),
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      },
      include: {
        actor: { select: { id: true, name: true, avatar: true } },
        department: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
      // One extra row, used only to answer "is there more" without a count
      // query over a table that grows without bound.
      take: q.limit + 1,
    })

    const hasMore = rows.length > q.limit
    const page = hasMore ? rows.slice(0, q.limit) : rows

    return ok(res, page, {
      hasMore,
      // Engine actions have no actor; the client renders them as the system.
      nextBefore: hasMore ? page[page.length - 1]?.createdAt ?? null : null,
    })
  } catch (err) {
    return fail(res, err)
  }
})

export default projectRoutes

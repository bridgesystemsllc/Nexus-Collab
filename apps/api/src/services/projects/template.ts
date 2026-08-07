import { z } from 'zod'
import type { Tx } from './numbering'
import { allocateTaskNumbers } from './numbering'

// ─── Template application ────────────────────────────────────
// A template is stored as JSON with day offsets relative to project start, so
// one definition applies to any start date. Applying it creates phases,
// milestones and tasks in a single transaction and wires the declared task
// dependencies.
//
// The stored JSON is admin-editable, so it is parsed defensively rather than
// trusted: a malformed template must fail with a clear message instead of
// producing a half-built plan.

export const templateTaskSchema = z.object({
  title: z.string().min(1),
  phaseSequence: z.number().int().optional(),
  departmentCode: z.string().optional(),
  offsetDays: z.number().int().default(0),
  durationDays: z.number().int().positive().default(1),
  estimatedHours: z.number().nonnegative().optional(),
  // Indexes into this template's own task array.
  dependsOn: z.array(z.number().int().nonnegative()).default([]),
})

export const templateDefinitionSchema = z.object({
  phases: z
    .array(
      z.object({
        name: z.string().min(1),
        sequence: z.number().int().positive(),
        offsetDays: z.number().int().default(0),
        durationDays: z.number().int().positive().default(1),
        departmentCode: z.string().optional(),
      }),
    )
    .default([]),
  milestones: z
    .array(
      z.object({
        name: z.string().min(1),
        phaseSequence: z.number().int().optional(),
        offsetDays: z.number().int().default(0),
        isGate: z.boolean().default(false),
        departmentCode: z.string().optional(),
      }),
    )
    .default([]),
  tasks: z.array(templateTaskSchema).default([]),
})

export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export interface ApplyTemplateResult {
  phases: number
  milestones: number
  tasks: number
  dependencies: number
  /** Department codes referenced by the template that this org does not have. */
  unresolvedDepartments: string[]
}

/**
 * Materialise a template onto a project. Caller supplies the transaction so
 * the whole plan lands atomically with the project itself.
 *
 * `fallbackDepartmentId` receives any task whose department code does not
 * resolve — the alternative is a task with no lane, which the policy layer
 * cannot authorise and which would be invisible in every department view.
 */
export async function applyTemplate(
  tx: Tx,
  opts: {
    projectId: string
    definition: unknown
    startDate: Date
    fallbackDepartmentId: string
    createdById?: string | null
  },
): Promise<ApplyTemplateResult> {
  const parsed = templateDefinitionSchema.safeParse(opts.definition)
  if (!parsed.success) {
    throw new Error(`Template definition is malformed: ${parsed.error.message}`)
  }
  const def = parsed.data

  // Resolve every department code the template mentions, in one query.
  const codes = new Set<string>()
  for (const p of def.phases) if (p.departmentCode) codes.add(p.departmentCode)
  for (const m of def.milestones) if (m.departmentCode) codes.add(m.departmentCode)
  for (const t of def.tasks) if (t.departmentCode) codes.add(t.departmentCode)

  const departments = codes.size
    ? await tx.department.findMany({
        where: { code: { in: [...codes] } },
        select: { id: true, code: true },
      })
    : []
  const deptByCode = new Map(departments.map((d) => [d.code as string, d.id]))
  const unresolvedDepartments = [...codes].filter((c) => !deptByCode.has(c))

  const resolveDept = (code?: string): string =>
    (code ? deptByCode.get(code) : undefined) ?? opts.fallbackDepartmentId

  // ── Phases ──
  const phaseIdBySequence = new Map<number, string>()
  for (const p of def.phases) {
    const start = addDays(opts.startDate, p.offsetDays)
    const end = addDays(start, p.durationDays)
    const created = await tx.projectPhase.create({
      data: {
        projectId: opts.projectId,
        name: p.name,
        sequence: p.sequence,
        departmentId: p.departmentCode ? deptByCode.get(p.departmentCode) ?? null : null,
        startDate: start,
        endDate: end,
        status: 'NOT_STARTED',
      },
      select: { id: true },
    })
    phaseIdBySequence.set(p.sequence, created.id)
  }

  // ── Milestones ──
  for (const m of def.milestones) {
    await tx.projectMilestone.create({
      data: {
        projectId: opts.projectId,
        phaseId: m.phaseSequence ? phaseIdBySequence.get(m.phaseSequence) ?? null : null,
        name: m.name,
        dueDate: addDays(opts.startDate, m.offsetDays),
        // The baseline is set at approval, not at creation — leaving it null
        // here keeps slip measured from an approved plan, not a draft.
        departmentId: m.departmentCode ? deptByCode.get(m.departmentCode) ?? null : null,
        isGate: m.isGate,
        status: 'PENDING',
      },
    })
  }

  // ── Tasks (numbers allocated as one contiguous block) ──
  const numbers = await allocateTaskNumbers(tx, opts.projectId, def.tasks.length)
  const taskIdByIndex: string[] = []

  for (let i = 0; i < def.tasks.length; i++) {
    const t = def.tasks[i]!
    const start = addDays(opts.startDate, t.offsetDays)
    const created = await tx.task.create({
      data: {
        projectId: opts.projectId,
        taskNumber: numbers[i],
        title: t.title,
        departmentId: resolveDept(t.departmentCode),
        phaseId: t.phaseSequence ? phaseIdBySequence.get(t.phaseSequence) ?? null : null,
        startDate: start,
        dueDate: addDays(start, t.durationDays),
        estimatedHours: t.estimatedHours ?? null,
        status: 'NOT_STARTED',
        sortOrder: i,
        createdById: opts.createdById ?? null,
      },
      select: { id: true },
    })
    taskIdByIndex.push(created.id)
  }

  // ── Dependencies ──
  // Templates are authored as a DAG, and indices are validated here rather
  // than running full cycle detection: a self-reference or out-of-range index
  // is a template bug worth surfacing, not user input to negotiate with.
  let dependencies = 0
  for (let i = 0; i < def.tasks.length; i++) {
    const successorId = taskIdByIndex[i]
    if (!successorId) continue
    for (const depIndex of def.tasks[i]!.dependsOn) {
      if (depIndex === i) {
        throw new Error(`Template task ${i} ("${def.tasks[i]!.title}") depends on itself`)
      }
      const predecessorId = taskIdByIndex[depIndex]
      if (!predecessorId) {
        throw new Error(
          `Template task ${i} ("${def.tasks[i]!.title}") depends on index ${depIndex}, which does not exist`,
        )
      }
      await tx.taskDependency.create({
        data: { predecessorId, successorId, dependencyType: 'FS', lagDays: 0 },
      })
      dependencies++
    }
  }

  return {
    phases: def.phases.length,
    milestones: def.milestones.length,
    tasks: def.tasks.length,
    dependencies,
    unresolvedDepartments,
  }
}

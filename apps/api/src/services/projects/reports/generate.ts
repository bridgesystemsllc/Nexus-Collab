import type { PrismaClient } from '@prisma/client'
import {
  buildProjectUpdate, buildStatusUpdate, buildExecutiveRollup, buildCloseout,
  type ReportType, type ReportProject, type ReportTask, type ReportMilestone,
  type ReportPhase, type ReportRisk, type ReportCheckin, type PortfolioProject, type Period,
} from './payload'
import { draftNarrative } from './narrative'

// ─── Report generation ───────────────────────────────────────
// Gathers the data a report needs, hands it to a pure builder, and persists the
// resulting payload verbatim.
//
// The payload is written once and never recomputed. Everything downstream —
// the viewer, the PDF, the CSV — reads the stored snapshot, which is what makes
// "a report generated last week returns identical content today" true rather
// than merely intended.

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = typeof v === 'object' && 'toNumber' in (v as any) ? (v as any).toNumber() : Number(v)
  return Number.isFinite(n) ? n : null
}

export interface GenerateResult {
  reportId: string
  reportType: ReportType
  title: string
  payload: unknown
  narrative: string | null
  narrativeSkippedReason?: string
}

function defaultPeriod(reportType: ReportType, now: Date): Period {
  // Weekly for digests, monthly for the exec rollup, weekly otherwise. Callers
  // can override; this is what "generate now" means without a stated period.
  const days = reportType === 'EXECUTIVE_ROLLUP' ? 30 : 7
  return { start: new Date(now.getTime() - days * 86_400_000), end: now }
}

// ─── Data gathering ──────────────────────────────────────────

async function loadProject(prisma: PrismaClient, projectId: string): Promise<ReportProject | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectType: { select: { label: true } },
      ownerDepartment: { select: { name: true } },
      projectManager: { select: { name: true } },
      executiveSponsor: { select: { name: true } },
      departments: {
        include: { department: { select: { name: true } }, laneLead: { select: { name: true } } },
      },
    },
  })
  if (!p || p.deletedAt) return null

  return {
    id: p.id,
    projectNumber: p.projectNumber,
    title: p.title,
    status: p.status,
    priority: p.priority,
    health: p.health,
    healthBand: p.healthBand,
    percentComplete: num(p.percentComplete) ?? 0,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
    baselineEndDate: p.baselineEndDate,
    actualEndDate: p.actualEndDate,
    budgetAmount: num(p.budgetAmount),
    actualSpend: num(p.actualSpend),
    currency: p.currency,
    businessCase: p.businessCase,
    successCriteria: p.successCriteria,
    lessonsLearned: p.lessonsLearned,
    brands: p.brands,
    retailers: p.retailers,
    projectTypeLabel: p.projectType?.label ?? null,
    ownerDepartmentName: p.ownerDepartment?.name ?? null,
    projectManagerName: p.projectManager?.name ?? null,
    executiveSponsorName: p.executiveSponsor?.name ?? null,
    departments: p.departments.map((d) => ({
      departmentId: d.departmentId,
      name: d.department.name,
      role: d.role,
      laneLeadName: d.laneLead?.name ?? null,
    })),
  }
}

async function loadTasks(prisma: PrismaClient, where: Record<string, unknown>): Promise<ReportTask[]> {
  const rows = await prisma.task.findMany({
    where: { deletedAt: null, ...where },
    include: {
      department: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: [{ taskNumber: 'asc' }],
  })
  return rows.map((t) => ({
    id: t.id,
    taskNumber: t.taskNumber,
    title: t.title,
    status: t.status,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    ownerName: t.owner?.name ?? null,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    blockedReason: t.blockedReason,
    blockedSince: t.blockedSince,
    estimatedHours: num(t.estimatedHours),
  }))
}

// ─── PROJECT_UPDATE / CLOSEOUT ───────────────────────────────

export async function generateProjectReport(
  prisma: PrismaClient,
  input: {
    projectId: string
    reportType: 'PROJECT_UPDATE' | 'CLOSEOUT'
    period?: Period
    orgId: string
    actorId?: string | null
    withNarrative?: boolean
    now?: Date
  },
): Promise<GenerateResult> {
  const now = input.now ?? new Date()
  const period = input.period ?? defaultPeriod(input.reportType, now)

  const project = await loadProject(prisma, input.projectId)
  if (!project) throw new Error('Project not found')

  // Fixed query count regardless of project size.
  const [tasks, phases, milestoneRows, riskRows, checkinRows] = await Promise.all([
    loadTasks(prisma, { projectId: input.projectId }),
    prisma.projectPhase.findMany({ where: { projectId: input.projectId }, orderBy: { sequence: 'asc' } }),
    prisma.projectMilestone.findMany({
      where: { projectId: input.projectId },
      include: { department: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.projectRisk.findMany({
      where: { projectId: input.projectId },
      include: { owner: { select: { name: true } }, department: { select: { name: true } } },
    }),
    prisma.projectCheckin.findMany({
      where: { projectId: input.projectId },
      include: { department: { select: { name: true } }, respondent: { select: { name: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    }),
  ])

  const milestones: ReportMilestone[] = milestoneRows.map((m) => ({
    id: m.id, name: m.name, dueDate: m.dueDate, baselineDate: m.baselineDate,
    completedDate: m.completedDate, status: m.status, isGate: m.isGate,
    departmentName: m.department?.name ?? null,
  }))
  const risks: ReportRisk[] = riskRows.map((r) => ({
    id: r.id, title: r.title, recordType: r.recordType, impact: r.impact,
    likelihood: r.likelihood, status: r.status,
    ownerName: r.owner?.name ?? null, departmentName: r.department?.name ?? null,
    dueDate: r.dueDate,
  }))
  const checkins: ReportCheckin[] = checkinRows.map((c) => ({
    id: c.id, departmentName: c.department?.name ?? null, status: c.status,
    confidence: c.confidence, progressSummary: c.progressSummary,
    blockers: c.blockers, needsFromOthers: c.needsFromOthers,
    respondedAt: c.respondedAt, respondentName: c.respondent?.name ?? null,
    dueAt: c.dueAt,
  }))

  const reportPhases: ReportPhase[] = phases.map((p) => ({
    id: p.id, name: p.name, sequence: p.sequence, status: p.status,
    startDate: p.startDate, endDate: p.endDate,
    baselineStart: p.baselineStart, baselineEnd: p.baselineEnd,
  }))

  const payload =
    input.reportType === 'CLOSEOUT'
      ? buildCloseout({ project, tasks, milestones, risks, now })
      : buildProjectUpdate({
          project, tasks, phases: reportPhases, milestones, risks, checkins, period, now,
        })

  const title =
    input.reportType === 'CLOSEOUT'
      ? `Closeout — ${project.projectNumber ?? project.title}`
      : `Project update — ${project.projectNumber ?? project.title}`

  return persist(prisma, {
    projectId: input.projectId,
    reportType: input.reportType,
    title,
    payload,
    period,
    orgId: input.orgId,
    actorId: input.actorId,
    withNarrative: input.withNarrative ?? true,
  })
}

// ─── Portfolio reports ───────────────────────────────────────

export async function generatePortfolioReport(
  prisma: PrismaClient,
  input: {
    reportType: 'STATUS_UPDATE' | 'EXECUTIVE_ROLLUP' | 'DEPARTMENT_DIGEST'
    departmentId?: string | null
    orgId: string
    period?: Period
    actorId?: string | null
    withNarrative?: boolean
    now?: Date
  },
): Promise<GenerateResult> {
  const now = input.now ?? new Date()
  const period = input.period ?? defaultPeriod(input.reportType, now)

  const scopeWhere: Record<string, unknown> = {
    orgId: input.orgId,
    deletedAt: null,
    status: { notIn: ['ARCHIVED', 'CANCELLED'] },
  }
  if (input.departmentId) {
    scopeWhere.OR = [
      { ownerDepartmentId: input.departmentId },
      { departments: { some: { departmentId: input.departmentId } } },
    ]
  }

  const projectRows = await prisma.project.findMany({
    where: scopeWhere,
    include: {
      projectType: { select: { label: true } },
      ownerDepartment: { select: { name: true } },
      projectManager: { select: { name: true } },
      executiveSponsor: { select: { name: true } },
      departments: {
        include: { department: { select: { name: true } }, laneLead: { select: { name: true } } },
      },
      milestones: {
        where: { isGate: true, status: { notIn: ['COMPLETE'] } },
        orderBy: { dueDate: 'asc' },
        take: 1,
      },
      _count: {
        select: {
          tasks: { where: { deletedAt: null, status: 'BLOCKED' } },
          milestones: { where: { status: { notIn: ['COMPLETE'] }, dueDate: { lt: now } } },
        },
      },
    },
  })

  const projectIds = projectRows.map((p) => p.id)

  // The previous health band comes from the activity feed, which is the only
  // place a band change is recorded. Without it the "changed this week"
  // section would silently be empty rather than wrong.
  const bandChanges = await prisma.projectActivity.findMany({
    where: {
      projectId: { in: projectIds },
      action: 'HEALTH_CHANGED',
      createdAt: { gte: period.start, lte: period.end },
    },
    orderBy: { createdAt: 'asc' },
    select: { projectId: true, summary: true },
  })
  const previousBand = new Map<string, string>()
  for (const a of bandChanges) {
    // Summary format: "Health GREEN → AMBER: ..." — take the first transition
    // seen in the period, so the report shows where the project started.
    const m = /Health (GREEN|AMBER|RED) → (GREEN|AMBER|RED)/.exec(a.summary)
    if (m && !previousBand.has(a.projectId)) previousBand.set(a.projectId, m[1] as string)
  }

  const projects: PortfolioProject[] = projectRows.map((p) => ({
    id: p.id,
    projectNumber: p.projectNumber,
    title: p.title,
    status: p.status,
    priority: p.priority,
    health: p.health,
    healthBand: p.healthBand,
    percentComplete: num(p.percentComplete) ?? 0,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
    baselineEndDate: p.baselineEndDate,
    actualEndDate: p.actualEndDate,
    budgetAmount: num(p.budgetAmount),
    actualSpend: num(p.actualSpend),
    currency: p.currency,
    brands: p.brands,
    retailers: p.retailers,
    projectTypeLabel: p.projectType?.label ?? null,
    ownerDepartmentName: p.ownerDepartment?.name ?? null,
    projectManagerName: p.projectManager?.name ?? null,
    executiveSponsorName: p.executiveSponsor?.name ?? null,
    departments: p.departments.map((d) => ({
      departmentId: d.departmentId, name: d.department.name, role: d.role,
      laneLeadName: d.laneLead?.name ?? null,
    })),
    openBlockers: p._count.tasks,
    overdueMilestones: p._count.milestones,
    previousHealthBand: previousBand.get(p.id) ?? null,
    nextGate: p.milestones[0]
      ? { name: p.milestones[0].name, due: p.milestones[0].dueDate, isGate: true }
      : null,
  }))

  const [blockedTasks, overdueMilestoneRows, checkinRows] = await Promise.all([
    loadTasks(prisma, { projectId: { in: projectIds }, status: 'BLOCKED' }),
    prisma.projectMilestone.findMany({
      where: {
        projectId: { in: projectIds },
        status: { notIn: ['COMPLETE'] },
        dueDate: { lt: now },
      },
      include: { department: { select: { name: true } } },
    }),
    prisma.projectCheckin.findMany({
      where: { projectId: { in: projectIds }, requestedAt: { gte: period.start, lte: period.end } },
      include: { department: { select: { name: true } } },
    }),
  ])

  const complianceMap = new Map<string, { asked: number; answered: number }>()
  for (const c of checkinRows) {
    const name = c.department?.name ?? 'All hands'
    const entry = complianceMap.get(name) ?? { asked: 0, answered: 0 }
    entry.asked++
    if (c.status === 'RESPONDED') entry.answered++
    complianceMap.set(name, entry)
  }
  const checkinCompliance = [...complianceMap.entries()].map(([department, v]) => ({
    department, ...v,
  }))

  const overdueMilestones: ReportMilestone[] = overdueMilestoneRows.map((m) => ({
    id: m.id, name: m.name, dueDate: m.dueDate, baselineDate: m.baselineDate,
    completedDate: m.completedDate, status: m.status, isGate: m.isGate,
    departmentName: m.department?.name ?? null,
  }))

  let scopeLabel = 'All departments'
  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } })
    scopeLabel = dept?.name ?? 'Department'
  }

  let payload: unknown
  let title: string

  if (input.reportType === 'EXECUTIVE_ROLLUP') {
    // On-time milestone rate across the period, computed here rather than in
    // the builder because it needs its own query shape.
    const periodMilestones = await prisma.projectMilestone.findMany({
      where: { projectId: { in: projectIds }, dueDate: { gte: period.start, lte: period.end } },
      select: { status: true, completedDate: true, dueDate: true },
    })
    const onTime = periodMilestones.filter(
      (m) => m.status === 'COMPLETE' && m.completedDate && m.completedDate <= m.dueDate,
    ).length
    const onTimeMilestonePercent = periodMilestones.length
      ? Math.round((onTime / periodMilestones.length) * 100)
      : 0

    const byType = new Map<string, number[]>()
    for (const p of projects) {
      const key = p.projectTypeLabel ?? 'Other'
      const slip = p.baselineEndDate && p.targetEndDate
        ? Math.max(0, Math.round((p.targetEndDate.getTime() - p.baselineEndDate.getTime()) / 86_400_000))
        : 0
      const list = byType.get(key)
      if (list) list.push(slip)
      else byType.set(key, [slip])
    }
    const cycleTimeByType = [...byType.entries()]
      .map(([type, slips]) => ({
        type,
        avgDays: Math.round(slips.reduce((a, b) => a + b, 0) / slips.length),
        count: slips.length,
      }))
      .sort((a, b) => b.avgDays - a.avgDays || a.type.localeCompare(b.type))

    payload = buildExecutiveRollup({ projects, cycleTimeByType, onTimeMilestonePercent, period, now })
    title = `Executive rollup — ${scopeLabel}`
  } else {
    payload = buildStatusUpdate({
      projects, blockedTasks, overdueMilestones, checkinCompliance,
      scopeLabel, period, now,
      reportType: input.reportType,
    })
    title =
      input.reportType === 'DEPARTMENT_DIGEST'
        ? `Department digest — ${scopeLabel}`
        : `Status update — ${scopeLabel}`
  }

  return persist(prisma, {
    projectId: null,
    reportType: input.reportType,
    title,
    payload,
    period,
    orgId: input.orgId,
    scopeDepartmentId: input.departmentId ?? null,
    actorId: input.actorId,
    withNarrative: input.withNarrative ?? true,
  })
}

// ─── Persistence ─────────────────────────────────────────────

async function persist(
  prisma: PrismaClient,
  input: {
    projectId: string | null
    reportType: ReportType
    title: string
    payload: unknown
    period: Period
    orgId: string
    scopeDepartmentId?: string | null
    actorId?: string | null
    withNarrative: boolean
  },
): Promise<GenerateResult> {
  let narrative: string | null = null
  let narrativeSkippedReason: string | undefined

  if (input.withNarrative) {
    const result = await draftNarrative(input.reportType, input.payload, { title: input.title })
    narrative = result.narrative
    narrativeSkippedReason = result.skippedReason
  }

  const row = await prisma.projectReport.create({
    data: {
      projectId: input.projectId,
      reportType: input.reportType,
      scopeDepartmentId: input.scopeDepartmentId ?? null,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      title: input.title,
      narrative,
      // Written verbatim and never recomputed. This is the frozen snapshot.
      payload: input.payload as object,
      generatedBy: input.actorId ? 'USER' : 'SYSTEM',
      generatedByUserId: input.actorId ?? null,
      isPublished: false,
      orgId: input.orgId,
    },
  })

  return {
    reportId: row.id,
    reportType: input.reportType,
    title: input.title,
    payload: input.payload,
    narrative,
    ...(narrativeSkippedReason ? { narrativeSkippedReason } : {}),
  }
}

// ─── CSV export ──────────────────────────────────────────────
// Rendered from the stored payload, so an export of a published report matches
// what was published rather than what is true now.

function csvEscape(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Flatten a report payload into CSV sections. Each array in the payload
 * becomes its own titled block, because a report has several shapes of row and
 * forcing them into one table loses the structure.
 */
export function payloadToCsv(payload: Record<string, unknown>): string {
  const lines: string[] = []

  const writeSection = (name: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return
    lines.push(`# ${name}`)
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    lines.push(columns.map(csvEscape).join(','))
    for (const row of rows) {
      lines.push(columns.map((c) => csvEscape(flatten(row[c]))).join(','))
    }
    lines.push('')
  }

  const flatten = (v: unknown): string => {
    if (v == null) return ''
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ')
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      writeSection(key, value as Record<string, unknown>[])
    }
  }

  // Scalar and nested-object fields land in a key/value block so nothing in the
  // payload is silently dropped from the export.
  const scalars: Record<string, unknown>[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) continue
    scalars.push({ field: key, value: flatten(value) })
  }
  writeSection('summary', scalars)

  return lines.join('\n')
}

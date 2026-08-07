// ─── Report payloads ─────────────────────────────────────────
// Pure builders: gathered data in, report payload out. No database access, no
// clock reads beyond what the caller passes.
//
// The payload is the report. It is persisted verbatim and never recomputed on
// read, so a report published in March still says what it said in March even
// after the project moves on. That property is only trustworthy if these
// functions are deterministic — same inputs, same output, always — which is
// why they take `now` as an argument rather than calling new Date().

export type ReportType =
  | 'PROJECT_UPDATE'
  | 'STATUS_UPDATE'
  | 'EXECUTIVE_ROLLUP'
  | 'DEPARTMENT_DIGEST'
  | 'CLOSEOUT'

export const REPORT_TYPES: ReportType[] = [
  'PROJECT_UPDATE', 'STATUS_UPDATE', 'EXECUTIVE_ROLLUP', 'DEPARTMENT_DIGEST', 'CLOSEOUT',
]

// ─── Input shapes ────────────────────────────────────────────
// Deliberately structural rather than importing Prisma types: the builders
// must be callable from a test with plain objects.

export interface ReportProject {
  id: string
  projectNumber: string | null
  title: string
  status: string
  priority: string
  health: number
  healthBand: string
  percentComplete: number
  startDate?: Date | null
  targetEndDate?: Date | null
  baselineEndDate?: Date | null
  actualEndDate?: Date | null
  budgetAmount?: number | null
  actualSpend?: number | null
  currency?: string | null
  businessCase?: string | null
  successCriteria?: string | null
  lessonsLearned?: string | null
  brands: string[]
  retailers: string[]
  projectTypeLabel?: string | null
  ownerDepartmentName?: string | null
  projectManagerName?: string | null
  executiveSponsorName?: string | null
  departments: { departmentId: string; name: string; role: string; laneLeadName?: string | null }[]
}

export interface ReportTask {
  id: string
  taskNumber: number | null
  title: string
  status: string
  departmentId: string | null
  departmentName?: string | null
  ownerName?: string | null
  dueDate?: Date | null
  completedAt?: Date | null
  blockedReason?: string | null
  blockedSince?: Date | null
  estimatedHours?: number | null
}

export interface ReportMilestone {
  id: string
  name: string
  dueDate: Date
  baselineDate?: Date | null
  completedDate?: Date | null
  status: string
  isGate: boolean
  departmentName?: string | null
}

export interface ReportPhase {
  id: string
  name: string
  sequence: number
  status: string
  startDate?: Date | null
  endDate?: Date | null
  baselineStart?: Date | null
  baselineEnd?: Date | null
}

export interface ReportRisk {
  id: string
  title: string
  recordType: string
  impact?: string | null
  likelihood?: string | null
  status: string
  ownerName?: string | null
  departmentName?: string | null
  dueDate?: Date | null
}

export interface ReportCheckin {
  id: string
  departmentName?: string | null
  status: string
  confidence?: string | null
  progressSummary?: string | null
  blockers?: string | null
  needsFromOthers?: string | null
  respondedAt?: Date | null
  respondentName?: string | null
  dueAt: Date
}

export interface Period {
  start: Date
  end: Date
}

// ─── Helpers ─────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** Dates are serialised as ISO day strings so a payload survives JSON round-trips. */
function day(d?: Date | null): string | null {
  if (!d) return null
  const t = d instanceof Date ? d : new Date(d)
  return Number.isFinite(t.getTime()) ? t.toISOString().slice(0, 10) : null
}

export function slipDays(baseline?: Date | null, target?: Date | null): number {
  if (!baseline || !target) return 0
  const n = Math.round((target.getTime() - baseline.getTime()) / MS_PER_DAY)
  return n > 0 ? n : 0
}

function inPeriod(d: Date | null | undefined, period: Period): boolean {
  if (!d) return false
  return d >= period.start && d <= period.end
}

const OPEN_TASK_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'])

function daysBlocked(task: ReportTask, now: Date): number | null {
  if (task.status !== 'BLOCKED' || !task.blockedSince) return null
  return Math.floor((now.getTime() - task.blockedSince.getTime()) / MS_PER_DAY)
}

/** Group a list into counts keyed by a field, sorted by count descending. */
function countBy<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1)
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    // Ties break alphabetically so the payload is byte-stable across runs —
    // a report that reorders itself between generations is not a snapshot.
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

// ─── PROJECT_UPDATE ──────────────────────────────────────────

export interface ProjectUpdatePayload {
  reportType: 'PROJECT_UPDATE'
  generatedAt: string
  period: { start: string | null; end: string | null }
  header: Record<string, unknown>
  timeline: { phases: unknown[]; slipDays: number }
  milestonesNext30Days: unknown[]
  completedThisPeriod: { department: string; tasks: unknown[] }[]
  inFlight: unknown[]
  blocked: unknown[]
  openRisks: unknown[]
  checkins: unknown[]
  budget: Record<string, unknown>
  nextPeriodCommitments: unknown[]
}

export function buildProjectUpdate(input: {
  project: ReportProject
  tasks: ReportTask[]
  phases: ReportPhase[]
  milestones: ReportMilestone[]
  risks: ReportRisk[]
  checkins: ReportCheckin[]
  period: Period
  now: Date
}): ProjectUpdatePayload {
  const { project, tasks, phases, milestones, risks, checkins, period, now } = input
  const in30Days = new Date(now.getTime() + 30 * MS_PER_DAY)

  const completed = tasks.filter((t) => t.status === 'COMPLETE' && inPeriod(t.completedAt, period))
  const byDept = new Map<string, ReportTask[]>()
  for (const t of completed) {
    const name = t.departmentName ?? 'Unassigned'
    const list = byDept.get(name)
    if (list) list.push(t)
    else byDept.set(name, [t])
  }

  return {
    reportType: 'PROJECT_UPDATE',
    generatedAt: now.toISOString(),
    period: { start: day(period.start), end: day(period.end) },
    header: {
      projectNumber: project.projectNumber,
      title: project.title,
      type: project.projectTypeLabel,
      status: project.status,
      priority: project.priority,
      health: project.health,
      healthBand: project.healthBand,
      percentComplete: project.percentComplete,
      projectManager: project.projectManagerName,
      executiveSponsor: project.executiveSponsorName,
      ownerDepartment: project.ownerDepartmentName,
      departments: project.departments.map((d) => ({
        name: d.name, role: d.role, laneLead: d.laneLeadName ?? null,
      })),
      brands: project.brands,
      retailers: project.retailers,
      startDate: day(project.startDate),
      targetEndDate: day(project.targetEndDate),
      baselineEndDate: day(project.baselineEndDate),
    },
    timeline: {
      phases: [...phases]
        .sort((a, b) => a.sequence - b.sequence)
        .map((p) => ({
          name: p.name,
          sequence: p.sequence,
          status: p.status,
          start: day(p.startDate),
          end: day(p.endDate),
          baselineStart: day(p.baselineStart),
          baselineEnd: day(p.baselineEnd),
          slipDays: slipDays(p.baselineEnd, p.endDate),
        })),
      slipDays: slipDays(project.baselineEndDate, project.targetEndDate),
    },
    milestonesNext30Days: milestones
      .filter((m) => m.status !== 'COMPLETE' && m.dueDate <= in30Days)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((m) => ({
        name: m.name,
        due: day(m.dueDate),
        isGate: m.isGate,
        status: m.status,
        department: m.departmentName ?? null,
        slipDays: slipDays(m.baselineDate, m.dueDate),
        isOverdue: m.dueDate < now,
      })),
    // Grouped by department, because "what did each lane ship" is the question
    // a cross-department status meeting actually asks.
    completedThisPeriod: [...byDept.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([department, list]) => ({
        department,
        tasks: list.map((t) => ({
          number: t.taskNumber, title: t.title, owner: t.ownerName ?? null,
          completed: day(t.completedAt),
        })),
      })),
    inFlight: tasks
      .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW')
      .map((t) => ({
        number: t.taskNumber, title: t.title, status: t.status,
        department: t.departmentName ?? null, owner: t.ownerName ?? null, due: day(t.dueDate),
      })),
    blocked: tasks
      .filter((t) => t.status === 'BLOCKED')
      .map((t) => ({
        number: t.taskNumber, title: t.title,
        department: t.departmentName ?? null, owner: t.ownerName ?? null,
        reason: t.blockedReason ?? null,
        daysBlocked: daysBlocked(t, now),
      }))
      // Longest-blocked first: age is the signal that matters.
      .sort((a, b) => (b.daysBlocked ?? 0) - (a.daysBlocked ?? 0)),
    openRisks: risks
      .filter((r) => r.status === 'OPEN' || r.status === 'MITIGATING')
      .map((r) => ({
        title: r.title, type: r.recordType, impact: r.impact, likelihood: r.likelihood,
        owner: r.ownerName ?? null, department: r.departmentName ?? null,
        status: r.status, due: day(r.dueDate),
      })),
    checkins: checkins
      .filter((c) => c.status === 'RESPONDED' && inPeriod(c.respondedAt, period))
      .map((c) => ({
        department: c.departmentName ?? 'All hands',
        confidence: c.confidence,
        progress: c.progressSummary,
        blockers: c.blockers,
        needs: c.needsFromOthers,
        respondent: c.respondentName ?? null,
        respondedAt: day(c.respondedAt),
      })),
    budget: {
      budget: project.budgetAmount ?? null,
      actual: project.actualSpend ?? null,
      currency: project.currency ?? 'USD',
      variance:
        project.budgetAmount != null && project.actualSpend != null
          ? Math.round((project.actualSpend - project.budgetAmount) * 100) / 100
          : null,
      percentOfBudget:
        project.budgetAmount && project.budgetAmount > 0 && project.actualSpend != null
          ? Math.round((project.actualSpend / project.budgetAmount) * 100)
          : null,
    },
    // Due next period, not merely "open" — a commitment is something with a date.
    nextPeriodCommitments: tasks
      .filter((t) => OPEN_TASK_STATUSES.has(t.status) && t.dueDate && t.dueDate > period.end)
      .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
      .slice(0, 20)
      .map((t) => ({
        number: t.taskNumber, title: t.title,
        department: t.departmentName ?? null, owner: t.ownerName ?? null, due: day(t.dueDate),
      })),
  }
}

// ─── STATUS_UPDATE (portfolio or department digest) ──────────

export interface PortfolioProject extends ReportProject {
  openBlockers: number
  overdueMilestones: number
  previousHealthBand?: string | null
  nextGate?: { name: string; due: Date; isGate: boolean } | null
}

export function buildStatusUpdate(input: {
  projects: PortfolioProject[]
  blockedTasks: ReportTask[]
  overdueMilestones: ReportMilestone[]
  checkinCompliance: { department: string; asked: number; answered: number }[]
  scopeLabel: string
  period: Period
  now: Date
  reportType?: 'STATUS_UPDATE' | 'DEPARTMENT_DIGEST'
}) {
  const { projects, blockedTasks, overdueMilestones, checkinCompliance, scopeLabel, period, now } = input
  const in14Days = new Date(now.getTime() + 14 * MS_PER_DAY)

  return {
    reportType: input.reportType ?? 'STATUS_UPDATE',
    generatedAt: now.toISOString(),
    scope: scopeLabel,
    period: { start: day(period.start), end: day(period.end) },
    counts: {
      total: projects.length,
      byStatus: countBy(projects, (p) => p.status),
      byHealth: countBy(projects, (p) => p.healthBand),
    },
    healthChanges: projects
      .filter((p) => p.previousHealthBand && p.previousHealthBand !== p.healthBand)
      .map((p) => ({
        projectNumber: p.projectNumber, title: p.title,
        from: p.previousHealthBand, to: p.healthBand,
      })),
    // Worst health first, then most blockers — the triage order a PM reads in.
    topAtRisk: [...projects]
      .filter((p) => p.healthBand !== 'GREEN')
      .sort((a, b) => a.health - b.health || b.openBlockers - a.openBlockers)
      .slice(0, 5)
      .map((p) => ({
        projectNumber: p.projectNumber, title: p.title,
        health: p.health, healthBand: p.healthBand,
        percentComplete: p.percentComplete,
        projectManager: p.projectManagerName,
        openBlockers: p.openBlockers,
        overdueMilestones: p.overdueMilestones,
        slipDays: slipDays(p.baselineEndDate, p.targetEndDate),
      })),
    overdueMilestones: overdueMilestones
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((m) => ({
        name: m.name, due: day(m.dueDate), isGate: m.isGate,
        department: m.departmentName ?? null,
        daysOverdue: Math.floor((now.getTime() - m.dueDate.getTime()) / MS_PER_DAY),
      })),
    blockedAging: blockedTasks
      .map((t) => ({
        number: t.taskNumber, title: t.title,
        department: t.departmentName ?? null, owner: t.ownerName ?? null,
        reason: t.blockedReason ?? null,
        daysBlocked: daysBlocked(t, now),
      }))
      .sort((a, b) => (b.daysBlocked ?? 0) - (a.daysBlocked ?? 0)),
    checkinCompliance: checkinCompliance
      .map((c) => ({
        ...c,
        rate: c.asked > 0 ? Math.round((c.answered / c.asked) * 100) : 0,
      }))
      .sort((a, b) => a.rate - b.rate || a.department.localeCompare(b.department)),
    upcomingGates: projects
      .map((p) => p.nextGate ? {
        projectNumber: p.projectNumber, title: p.title,
        gate: p.nextGate.name, due: day(p.nextGate.due),
      } : null)
      .filter((g): g is NonNullable<typeof g> => !!g && !!g.due && new Date(g.due) <= in14Days),
  }
}

// ─── EXECUTIVE_ROLLUP ────────────────────────────────────────

export function buildExecutiveRollup(input: {
  projects: PortfolioProject[]
  cycleTimeByType: { type: string; avgDays: number; count: number }[]
  onTimeMilestonePercent: number
  period: Period
  now: Date
}) {
  const { projects, cycleTimeByType, onTimeMilestonePercent, period, now } = input

  const withBudget = projects.filter((p) => p.budgetAmount != null && p.budgetAmount > 0)
  const totalBudget = withBudget.reduce((sum, p) => sum + (p.budgetAmount ?? 0), 0)
  const totalSpend = withBudget.reduce((sum, p) => sum + (p.actualSpend ?? 0), 0)

  const slips = projects
    .map((p) => slipDays(p.baselineEndDate, p.targetEndDate))
    .filter((n) => n > 0)

  const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

  return {
    reportType: 'EXECUTIVE_ROLLUP' as const,
    generatedAt: now.toISOString(),
    period: { start: day(period.start), end: day(period.end) },
    healthDistribution: countBy(projects, (p) => p.healthBand),
    onTimeMilestonePercent,
    slip: {
      projectsSlipping: slips.length,
      averageSlipDays: slips.length ? Math.round(slips.reduce((a, b) => a + b, 0) / slips.length) : 0,
      maxSlipDays: slips.length ? Math.max(...slips) : 0,
      averageByType: cycleTimeByType,
    },
    budget: {
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      percentSpent: totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : null,
      projectsOverBudget: withBudget.filter(
        (p) => (p.actualSpend ?? 0) > (p.budgetAmount ?? 0) * 1.1,
      ).length,
      // Stated explicitly rather than left implicit: a spend total that silently
      // excludes unbudgeted projects reads as complete when it is not.
      projectsWithoutBudget: projects.length - withBudget.length,
    },
    topInitiatives: [...projects]
      .sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
          a.health - b.health,
      )
      .slice(0, 10)
      .map((p) => ({
        projectNumber: p.projectNumber,
        title: p.title,
        priority: p.priority,
        healthBand: p.healthBand,
        percentComplete: p.percentComplete,
        owner: p.ownerDepartmentName,
        // One line, because an exec rollup that needs a second page is not one.
        status: `${p.status.replace(/_/g, ' ').toLowerCase()}, ${p.percentComplete}% complete` +
          (slipDays(p.baselineEndDate, p.targetEndDate) > 0
            ? `, ${slipDays(p.baselineEndDate, p.targetEndDate)}d past baseline`
            : ''),
      })),
  }
}

// ─── CLOSEOUT ────────────────────────────────────────────────

export function buildCloseout(input: {
  project: ReportProject
  tasks: ReportTask[]
  milestones: ReportMilestone[]
  risks: ReportRisk[]
  now: Date
}) {
  const { project, tasks, milestones, risks, now } = input

  const completed = tasks.filter((t) => t.status === 'COMPLETE')
  const byDept = countBy(completed, (t) => t.departmentName ?? 'Unassigned')

  return {
    reportType: 'CLOSEOUT' as const,
    generatedAt: now.toISOString(),
    header: {
      projectNumber: project.projectNumber,
      title: project.title,
      type: project.projectTypeLabel,
      projectManager: project.projectManagerName,
      executiveSponsor: project.executiveSponsorName,
      ownerDepartment: project.ownerDepartmentName,
      departments: project.departments.map((d) => d.name),
    },
    dates: {
      start: day(project.startDate),
      baselineEnd: day(project.baselineEndDate),
      targetEnd: day(project.targetEndDate),
      actualEnd: day(project.actualEndDate),
      // Measured against the baseline where one exists, so "we finished late"
      // means late against what was committed, not against a moved target.
      totalSlipDays: slipDays(project.baselineEndDate, project.actualEndDate ?? project.targetEndDate),
    },
    delivery: {
      tasksCompleted: completed.length,
      tasksCancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
      tasksByDepartment: byDept.map((d) => ({ department: d.key, completed: d.count })),
      milestonesTotal: milestones.length,
      milestonesMissed: milestones.filter((m) => m.status === 'MISSED').length,
      gatesMissed: milestones.filter((m) => m.isGate && m.status === 'MISSED').length,
    },
    risksRealized: risks
      .filter((r) => r.recordType === 'ISSUE' || r.status === 'RESOLVED')
      .map((r) => ({
        title: r.title, type: r.recordType, impact: r.impact, status: r.status,
        owner: r.ownerName ?? null,
      })),
    budget: {
      budget: project.budgetAmount ?? null,
      actual: project.actualSpend ?? null,
      currency: project.currency ?? 'USD',
      variance:
        project.budgetAmount != null && project.actualSpend != null
          ? Math.round((project.actualSpend - project.budgetAmount) * 100) / 100
          : null,
    },
    businessCase: project.businessCase ?? null,
    successCriteria: project.successCriteria ?? null,
    lessonsLearned: project.lessonsLearned ?? null,
  }
}

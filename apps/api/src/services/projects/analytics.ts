import type { PrismaClient } from '@prisma/client'
import { partsInZone, zonedWallClockToUtc, PROJECT_TZ } from './cadence'

// ─── Project analytics ───────────────────────────────────────
// The computations are pure functions over gathered rows; the queries live
// below them. Same split as the report builders, for the same reason: a
// dashboard number that cannot be reproduced from known inputs is a number
// nobody can argue with, which is worse than one that is wrong.
//
// Every function that depends on the passage of time takes `now` as an
// argument.

const MS_PER_DAY = 86_400_000

export type Band = 'GREEN' | 'AMBER' | 'RED'
const BANDS: Band[] = ['GREEN', 'AMBER', 'RED']

/** Counts keyed by a field, ties broken alphabetically so output is stable. */
function countBy<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1)
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

// ─── Summary ─────────────────────────────────────────────────

export interface SummaryProject {
  id: string
  status: string
  priority: string
  health: number
  healthBand: string
  percentComplete: number
  targetEndDate?: Date | null
  baselineEndDate?: Date | null
  budgetAmount?: number | null
  actualSpend?: number | null
}

export interface SummaryCounts {
  openBlockedTasks: number
  overdueTasks: number
  overdueMilestones: number
  openCriticalRisks: number
}

export function buildSummary(input: {
  projects: SummaryProject[]
  counts: SummaryCounts
  now: Date
}) {
  const { projects, counts, now } = input
  const active = projects.filter((p) => !['ARCHIVED', 'CANCELLED', 'COMPLETED'].includes(p.status))

  const withBudget = projects.filter((p) => p.budgetAmount != null && p.budgetAmount > 0)
  const totalBudget = withBudget.reduce((s, p) => s + (p.budgetAmount ?? 0), 0)
  const totalSpend = withBudget.reduce((s, p) => s + (p.actualSpend ?? 0), 0)

  const slips = active
    .map((p) =>
      p.baselineEndDate && p.targetEndDate
        ? Math.max(0, Math.round((p.targetEndDate.getTime() - p.baselineEndDate.getTime()) / MS_PER_DAY))
        : 0,
    )
    .filter((n) => n > 0)

  // "Due soon" is the next 14 days and still open — the window a weekly review
  // actually acts on.
  const in14 = new Date(now.getTime() + 14 * MS_PER_DAY)

  return {
    generatedAt: now.toISOString(),
    total: projects.length,
    active: active.length,
    byStatus: countBy(projects, (p) => p.status),
    byHealth: countBy(projects, (p) => p.healthBand),
    byPriority: countBy(active, (p) => p.priority),
    // Averaged over active projects only: finished work sitting at 100% would
    // otherwise flatter the number indefinitely.
    averagePercentComplete: active.length
      ? Math.round(active.reduce((s, p) => s + p.percentComplete, 0) / active.length)
      : 0,
    averageHealth: active.length
      ? Math.round(active.reduce((s, p) => s + p.health, 0) / active.length)
      : 0,
    atRisk: active.filter((p) => p.healthBand !== 'GREEN').length,
    dueSoon: active.filter((p) => p.targetEndDate && p.targetEndDate > now && p.targetEndDate <= in14).length,
    overdue: active.filter((p) => p.targetEndDate && p.targetEndDate < now).length,
    slip: {
      projectsSlipping: slips.length,
      averageSlipDays: slips.length ? Math.round(slips.reduce((a, b) => a + b, 0) / slips.length) : 0,
      maxSlipDays: slips.length ? Math.max(...slips) : 0,
    },
    budget: {
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      percentSpent: totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : null,
      // Stated rather than implied: a spend figure that silently omits
      // unbudgeted projects reads as complete when it is not.
      projectsWithoutBudget: projects.length - withBudget.length,
    },
    ...counts,
  }
}

// ─── Health trend ────────────────────────────────────────────

export interface TrendSnapshot {
  day: Date
  band: string
  score: number
}

export interface HealthTrendPoint {
  day: string
  GREEN: number
  AMBER: number
  RED: number
  total: number
  averageScore: number | null
}

/**
 * Band distribution per day over the requested window.
 *
 * Days with no snapshot are returned with zero counts and a null average
 * rather than being interpolated or omitted. Interpolating would invent
 * history; omitting would compress the x-axis and make a two-day-old system
 * look like it has ninety days of steady green.
 *
 * `coverage` says what the data actually spans, so the caller can label the
 * chart honestly instead of implying the whole window is real.
 */
export function buildHealthTrend(input: {
  snapshots: TrendSnapshot[]
  days: number
  now: Date
}): { points: HealthTrendPoint[]; coverage: { daysRequested: number; daysWithData: number; firstDay: string | null } } {
  const { snapshots, days, now } = input

  const byDay = new Map<string, TrendSnapshot[]>()
  for (const s of snapshots) {
    const key = s.day.toISOString().slice(0, 10)
    const list = byDay.get(key)
    if (list) list.push(s)
    else byDay.set(key, [s])
  }

  // Walk back over ET calendar days. Stepping by fixed milliseconds would skip
  // or repeat a day at each DST transition.
  const p = partsInZone(now, PROJECT_TZ)
  const points: HealthTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day - i))
    const key = zonedWallClockToUtc(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, PROJECT_TZ,
    ).toISOString().slice(0, 10)

    const rows = byDay.get(key) ?? []
    const point: HealthTrendPoint = {
      day: key, GREEN: 0, AMBER: 0, RED: 0,
      total: rows.length,
      averageScore: rows.length
        ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
        : null,
    }
    for (const r of rows) {
      if (BANDS.includes(r.band as Band)) point[r.band as Band]++
    }
    points.push(point)
  }

  const withData = points.filter((pt) => pt.total > 0)
  return {
    points,
    coverage: {
      daysRequested: days,
      daysWithData: withData.length,
      firstDay: withData[0]?.day ?? null,
    },
  }
}

// ─── Workload ────────────────────────────────────────────────

export interface WorkloadTask {
  id: string
  status: string
  dueDate?: Date | null
  estimatedHours?: number | null
  ownerId: string | null
  ownerName?: string | null
  departmentName?: string | null
  blockedSince?: Date | null
}

const OPEN = new Set(['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'])

/**
 * Open work per assignee, worst first.
 *
 * Only open tasks are counted. A person who closed forty tasks last quarter is
 * not carrying forty tasks, and a workload view that says otherwise sends work
 * to the wrong people.
 */
export function buildWorkload(input: { tasks: WorkloadTask[]; now: Date }) {
  const { tasks, now } = input
  const open = tasks.filter((t) => OPEN.has(t.status))

  const byOwner = new Map<string, WorkloadTask[]>()
  for (const t of open) {
    const key = t.ownerId ?? '__unassigned'
    const list = byOwner.get(key)
    if (list) list.push(t)
    else byOwner.set(key, [t])
  }

  const rows = [...byOwner.entries()].map(([key, list]) => ({
    ownerId: key === '__unassigned' ? null : key,
    ownerName: key === '__unassigned' ? 'Unassigned' : list[0]?.ownerName ?? 'Unknown',
    open: list.length,
    overdue: list.filter((t) => t.dueDate && t.dueDate < now).length,
    blocked: list.filter((t) => t.status === 'BLOCKED').length,
    // Null, not 0, when nothing is estimated — 0 hours reads as "no work".
    estimatedHours: list.some((t) => t.estimatedHours != null)
      ? Math.round(list.reduce((s, t) => s + (t.estimatedHours ?? 0), 0) * 10) / 10
      : null,
    departments: [...new Set(list.map((t) => t.departmentName).filter(Boolean))] as string[],
  }))

  // Most overdue first, then most open. Unassigned always last: it is a queue,
  // not a person, and it would otherwise dominate the top of the table.
  rows.sort((a, b) => {
    if (!a.ownerId) return 1
    if (!b.ownerId) return -1
    return b.overdue - a.overdue || b.open - a.open || a.ownerName.localeCompare(b.ownerName)
  })

  return {
    generatedAt: now.toISOString(),
    assignees: rows,
    totals: {
      openTasks: open.length,
      unassigned: byOwner.get('__unassigned')?.length ?? 0,
      overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      blocked: open.filter((t) => t.status === 'BLOCKED').length,
      peopleWithWork: rows.filter((r) => r.ownerId).length,
    },
  }
}

// ─── Cycle time ──────────────────────────────────────────────

export interface CycleProject {
  id: string
  status: string
  typeLabel: string
  startDate?: Date | null
  targetEndDate?: Date | null
  baselineEndDate?: Date | null
  actualEndDate?: Date | null
}

/**
 * Delivery time by project type, baseline versus actual.
 *
 * Only completed projects with both a start and an actual end contribute to
 * `actualDays`. Slip is measured against the baseline, and projects that were
 * never baselined are excluded from the slip figure and counted separately —
 * treating "no baseline" as "zero slip" would make an unplanned project look
 * like a punctual one.
 */
export function buildCycleTime(input: { projects: CycleProject[]; now: Date }) {
  const { projects, now } = input

  const byType = new Map<string, CycleProject[]>()
  for (const p of projects) {
    const list = byType.get(p.typeLabel)
    if (list) list.push(p)
    else byType.set(p.typeLabel, [p])
  }

  const rows = [...byType.entries()].map(([type, list]) => {
    const completed = list.filter(
      (p) => p.status === 'COMPLETED' && p.startDate && p.actualEndDate,
    )
    const actualDays = completed.map((p) =>
      Math.max(0, Math.round((p.actualEndDate!.getTime() - p.startDate!.getTime()) / MS_PER_DAY)),
    )

    const baselined = list.filter((p) => p.baselineEndDate)
    const slips = baselined.map((p) => {
      const end = p.actualEndDate ?? p.targetEndDate ?? now
      return Math.round((end.getTime() - p.baselineEndDate!.getTime()) / MS_PER_DAY)
    })

    const plannedDays = completed
      .filter((p) => p.baselineEndDate)
      .map((p) =>
        Math.max(0, Math.round((p.baselineEndDate!.getTime() - p.startDate!.getTime()) / MS_PER_DAY)),
      )

    const onTime = completed.filter(
      (p) => p.baselineEndDate && p.actualEndDate! <= p.baselineEndDate!,
    ).length
    const withBaseline = completed.filter((p) => p.baselineEndDate).length

    return {
      type,
      projects: list.length,
      completed: completed.length,
      averageActualDays: actualDays.length
        ? Math.round(actualDays.reduce((a, b) => a + b, 0) / actualDays.length)
        : null,
      averagePlannedDays: plannedDays.length
        ? Math.round(plannedDays.reduce((a, b) => a + b, 0) / plannedDays.length)
        : null,
      averageSlipDays: slips.length
        ? Math.round(slips.reduce((a, b) => a + b, 0) / slips.length)
        : null,
      onTimePercent: withBaseline > 0 ? pct(onTime, withBaseline) : null,
      withoutBaseline: list.length - baselined.length,
    }
  })

  // Worst slip first; types with no slip figure sink to the bottom rather than
  // sorting as if they were zero.
  rows.sort((a, b) => {
    if (a.averageSlipDays == null && b.averageSlipDays == null) return a.type.localeCompare(b.type)
    if (a.averageSlipDays == null) return 1
    if (b.averageSlipDays == null) return -1
    return b.averageSlipDays - a.averageSlipDays || a.type.localeCompare(b.type)
  })

  return { generatedAt: now.toISOString(), types: rows }
}

// ─── Check-in compliance ─────────────────────────────────────

export interface ComplianceCheckin {
  departmentId: string | null
  departmentName?: string | null
  status: string
  requestedAt: Date
  dueAt: Date
  respondedAt?: Date | null
}

/**
 * Answer rate by department.
 *
 * Only check-ins whose window has closed are counted. Including ones still
 * open would score a department as non-compliant for a request sent an hour
 * ago, and every Monday morning would look like a collapse.
 */
export function buildCheckinCompliance(input: { checkins: ComplianceCheckin[]; now: Date }) {
  const { checkins, now } = input
  const closed = checkins.filter((c) => c.dueAt < now || c.status === 'RESPONDED')

  const byDept = new Map<string, ComplianceCheckin[]>()
  for (const c of closed) {
    const key = c.departmentName ?? 'All hands'
    const list = byDept.get(key)
    if (list) list.push(c)
    else byDept.set(key, [c])
  }

  const rows = [...byDept.entries()].map(([department, list]) => {
    const answered = list.filter((c) => c.status === 'RESPONDED')
    const onTime = answered.filter((c) => c.respondedAt && c.respondedAt <= c.dueAt).length
    const turnarounds = answered
      .filter((c) => c.respondedAt)
      .map((c) => (c.respondedAt!.getTime() - c.requestedAt.getTime()) / 3_600_000)

    return {
      department,
      asked: list.length,
      answered: answered.length,
      rate: pct(answered.length, list.length),
      onTimeRate: answered.length ? pct(onTime, answered.length) : 0,
      averageHoursToRespond: turnarounds.length
        ? Math.round((turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) * 10) / 10
        : null,
    }
  })

  // Worst compliance first — this table exists to find the department that is
  // not answering, not to congratulate the one that is.
  rows.sort((a, b) => a.rate - b.rate || b.asked - a.asked || a.department.localeCompare(b.department))

  const totalAsked = closed.length
  const totalAnswered = closed.filter((c) => c.status === 'RESPONDED').length

  return {
    generatedAt: now.toISOString(),
    departments: rows,
    overall: {
      asked: totalAsked,
      answered: totalAnswered,
      rate: pct(totalAnswered, totalAsked),
      // Excluded from the rate but reported, so the number is not silently
      // taken over a smaller set than the reader assumes.
      stillOpen: checkins.length - closed.length,
    },
  }
}

// ─── Query layer ─────────────────────────────────────────────
// Each of these is a fixed number of queries regardless of portfolio size.

/** Projects in scope: owned by, or participating in, the department. */
function scopeWhere(orgId: string, departmentId?: string | null): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId, deletedAt: null }
  if (departmentId) {
    where.OR = [
      { ownerDepartmentId: departmentId },
      { departments: { some: { departmentId } } },
    ]
  }
  return where
}

export async function summaryFor(
  prisma: PrismaClient,
  input: { orgId: string; departmentId?: string | null; now?: Date },
) {
  const now = input.now ?? new Date()
  const where = scopeWhere(input.orgId, input.departmentId)

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true, status: true, priority: true, health: true, healthBand: true,
      percentComplete: true, targetEndDate: true, baselineEndDate: true,
      budgetAmount: true, actualSpend: true,
    },
  })
  const ids = projects.map((p) => p.id)

  const taskWhere = {
    projectId: { in: ids },
    deletedAt: null,
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
  }

  const [openBlockedTasks, overdueTasks, overdueMilestones, openCriticalRisks] = await Promise.all([
    prisma.task.count({ where: { ...taskWhere, status: 'BLOCKED' } }),
    prisma.task.count({
      where: {
        ...taskWhere,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] },
        dueDate: { lt: now },
      },
    }),
    prisma.projectMilestone.count({
      where: { projectId: { in: ids }, status: { notIn: ['COMPLETE'] }, dueDate: { lt: now } },
    }),
    prisma.projectRisk.count({
      where: { projectId: { in: ids }, impact: 'CRITICAL', status: { in: ['OPEN', 'MITIGATING'] } },
    }),
  ])

  return buildSummary({
    projects: projects.map((p) => ({
      ...p,
      percentComplete: Number(p.percentComplete),
      budgetAmount: p.budgetAmount ? Number(p.budgetAmount) : null,
      actualSpend: p.actualSpend ? Number(p.actualSpend) : null,
    })),
    counts: { openBlockedTasks, overdueTasks, overdueMilestones, openCriticalRisks },
    now,
  })
}

export async function healthTrendFor(
  prisma: PrismaClient,
  input: { orgId: string; departmentId?: string | null; days: number; now?: Date },
) {
  const now = input.now ?? new Date()
  const since = new Date(now.getTime() - input.days * MS_PER_DAY)

  const snapshots = await prisma.projectHealthSnapshot.findMany({
    where: {
      orgId: input.orgId,
      day: { gte: since },
      ...(input.departmentId
        ? { project: { is: scopeWhere(input.orgId, input.departmentId) } }
        : {}),
    },
    select: { day: true, band: true, score: true },
    orderBy: { day: 'asc' },
  })

  return buildHealthTrend({ snapshots, days: input.days, now })
}

export async function workloadFor(
  prisma: PrismaClient,
  input: { orgId: string; departmentId?: string | null; now?: Date },
) {
  const now = input.now ?? new Date()
  const projects = await prisma.project.findMany({
    where: scopeWhere(input.orgId, input.departmentId),
    select: { id: true },
  })

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      deletedAt: null,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    },
    select: {
      id: true, status: true, dueDate: true, estimatedHours: true, blockedSince: true,
      ownerId: true,
      owner: { select: { name: true } },
      department: { select: { name: true } },
    },
  })

  return buildWorkload({
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      blockedSince: t.blockedSince,
      ownerId: t.ownerId,
      ownerName: t.owner?.name ?? null,
      departmentName: t.department?.name ?? null,
    })),
    now,
  })
}

export async function cycleTimeFor(
  prisma: PrismaClient,
  input: { orgId: string; typeId?: string | null; departmentId?: string | null; now?: Date },
) {
  const now = input.now ?? new Date()
  const projects = await prisma.project.findMany({
    where: {
      ...scopeWhere(input.orgId, input.departmentId),
      ...(input.typeId ? { projectTypeId: input.typeId } : {}),
    },
    select: {
      id: true, status: true, startDate: true, targetEndDate: true,
      baselineEndDate: true, actualEndDate: true,
      projectType: { select: { label: true } },
    },
  })

  return buildCycleTime({
    projects: projects.map((p) => ({
      id: p.id,
      status: p.status,
      typeLabel: p.projectType?.label ?? 'Untyped',
      startDate: p.startDate,
      targetEndDate: p.targetEndDate,
      baselineEndDate: p.baselineEndDate,
      actualEndDate: p.actualEndDate,
    })),
    now,
  })
}

export async function checkinComplianceFor(
  prisma: PrismaClient,
  input: { orgId: string; departmentId?: string | null; days?: number; now?: Date },
) {
  const now = input.now ?? new Date()
  const days = input.days ?? 90
  const since = new Date(now.getTime() - days * MS_PER_DAY)

  const projects = await prisma.project.findMany({
    where: scopeWhere(input.orgId, input.departmentId),
    select: { id: true },
  })

  const checkins = await prisma.projectCheckin.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      requestedAt: { gte: since },
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    },
    select: {
      departmentId: true, status: true, requestedAt: true, dueAt: true, respondedAt: true,
      department: { select: { name: true } },
    },
  })

  return buildCheckinCompliance({
    checkins: checkins.map((c) => ({
      departmentId: c.departmentId,
      departmentName: c.department?.name ?? null,
      status: c.status,
      requestedAt: c.requestedAt,
      dueAt: c.dueAt,
      respondedAt: c.respondedAt,
    })),
    now,
  })
}

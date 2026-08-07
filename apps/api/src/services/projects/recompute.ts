import type { PrismaClient } from '@prisma/client'
import { rollupProject } from './rollup'
import {
  computeHealth, slipDaysBetween, autoStatusFor, bandWorsened,
  type HealthBand, type HealthResult,
} from './health'
import { logActivity } from './activity'

// ─── Recompute a project's derived state ─────────────────────
// Percent complete and health are cached on the project row and refreshed on
// write, never computed per read: the project list renders dozens of rows and
// recomputing each would mean a fan-out of queries per page view.
//
// Recomputes are debounced per project. A drag across a task board fires many
// writes in a second; without coalescing, each one would run the full signal
// gather and the last would win anyway.

export interface RecomputeResult {
  projectId: string
  percentComplete: number
  health: HealthResult
  previousBand: HealthBand
  statusChangedTo?: string
}

const DEBOUNCE_MS = Number(process.env.PROJECT_RECOMPUTE_DEBOUNCE_MS ?? 1500)
const pending = new Map<string, NodeJS.Timeout>()

/**
 * Queue a recompute, coalescing rapid writes to the same project.
 * Fire-and-forget by design: a failed recompute must never roll back the
 * user's actual edit, so it logs and moves on.
 */
export function scheduleRecompute(prisma: PrismaClient, projectId: string): void {
  const existing = pending.get(projectId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pending.delete(projectId)
    recomputeProject(prisma, projectId).catch((err) => {
      console.error(`[projects] recompute failed for ${projectId}:`, err)
    })
  }, DEBOUNCE_MS)

  // Do not hold the process open for a pending recompute during shutdown.
  if (typeof timer.unref === 'function') timer.unref()
  pending.set(projectId, timer)
}

/** Run any queued recomputes immediately. Used by tests and the cron job. */
export async function flushRecomputes(prisma: PrismaClient): Promise<void> {
  const ids = [...pending.keys()]
  for (const id of ids) {
    const t = pending.get(id)
    if (t) clearTimeout(t)
    pending.delete(id)
    await recomputeProject(prisma, id).catch((err) =>
      console.error(`[projects] flush recompute failed for ${id}:`, err),
    )
  }
}

export async function recomputeProject(
  prisma: PrismaClient,
  projectId: string,
  now = new Date(),
): Promise<RecomputeResult | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, status: true, health: true, healthBand: true,
      baselineEndDate: true, targetEndDate: true, lastActivityAt: true,
      budgetAmount: true, actualSpend: true,
      projectManagerId: true, executiveSponsorId: true, deletedAt: true,
      projectNumber: true, title: true,
      departments: { select: { departmentId: true, laneLeadId: true } },
    },
  })
  if (!project || project.deletedAt) return null

  // Gather every signal in a fixed number of queries regardless of size.
  const [tasks, phases, overdueMilestones, openCriticalRisks, overdueCheckins] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true, status: true, percentComplete: true, estimatedHours: true,
        phaseId: true, dueDate: true, blockedSince: true,
      },
    }),
    prisma.projectPhase.findMany({ where: { projectId }, select: { id: true, status: true } }),
    prisma.projectMilestone.count({
      where: { projectId, status: { notIn: ['COMPLETE'] }, dueDate: { lt: now } },
    }),
    prisma.projectRisk.count({
      where: { projectId, impact: 'CRITICAL', status: { in: ['OPEN', 'MITIGATING'] } },
    }),
    prisma.projectCheckin.count({
      where: { projectId, status: { in: ['PENDING', 'OVERDUE'] }, dueAt: { lt: now } },
    }),
  ])

  const rollup = rollupProject(
    phases,
    tasks.map((t) => ({
      id: t.id,
      status: t.status,
      percentComplete: t.percentComplete,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      phaseId: t.phaseId,
    })),
  )

  const openStatuses = new Set(['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'])
  const overdueTasks = tasks.filter(
    (t) => openStatuses.has(t.status) && t.dueDate && t.dueDate < now,
  ).length

  const fiveDaysAgo = new Date(now.getTime() - 5 * 86_400_000)
  const longBlockedTasks = tasks.filter(
    (t) => t.status === 'BLOCKED' && t.blockedSince && t.blockedSince < fiveDaysAgo,
  ).length

  const health = computeHealth({
    now,
    status: project.status,
    overdueMilestones,
    overdueTasks,
    longBlockedTasks,
    slipDays: slipDaysBetween(project.baselineEndDate, project.targetEndDate),
    checkinOverdue: overdueCheckins > 0,
    lastActivityAt: project.lastActivityAt,
    openCriticalRisks,
    budgetAmount: project.budgetAmount ? Number(project.budgetAmount) : null,
    actualSpend: project.actualSpend ? Number(project.actualSpend) : null,
  })

  const previousBand = (project.healthBand as HealthBand) ?? 'GREEN'
  const nextStatus = autoStatusFor(project.status, previousBand, health.band)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      percentComplete: rollup.percentComplete,
      health: health.score,
      healthBand: health.band,
      healthComputedAt: now,
      ...(nextStatus ? { status: nextStatus } : {}),
    },
  })

  // Persist per-phase completion so the timeline does not recompute per render.
  for (const p of rollup.phases) {
    const phase = phases.find((x) => x.id === p.phaseId)
    if (!phase) continue
    const status =
      p.taskCount === 0 ? phase.status ?? 'NOT_STARTED'
      : p.percentComplete >= 100 ? 'COMPLETE'
      : p.percentComplete > 0 ? 'IN_PROGRESS'
      : 'NOT_STARTED'
    // Do not overwrite a manually-set BLOCKED or SKIPPED phase.
    if (phase.status === 'BLOCKED' || phase.status === 'SKIPPED') continue
    if (status !== phase.status) {
      await prisma.projectPhase.update({ where: { id: p.phaseId }, data: { status } })
    }
  }

  // Only a worsening band is worth interrupting anyone over. Recovery is
  // visible in the UI without a notification, and alerting on every wobble is
  // how alerts get ignored.
  if (bandWorsened(previousBand, health.band)) {
    await notifyBandDrop(prisma, {
      projectId,
      projectNumber: project.projectNumber,
      title: project.title,
      previousBand,
      nextBand: health.band,
      topReason: health.penalties[0]?.label ?? 'Multiple signals',
      recipients: [
        project.projectManagerId,
        project.executiveSponsorId,
        ...project.departments.map((d) => d.laneLeadId),
      ].filter((x): x is string => !!x),
      autoStatus: nextStatus,
    })
  }

  return {
    projectId,
    percentComplete: rollup.percentComplete,
    health,
    previousBand,
    ...(nextStatus ? { statusChangedTo: nextStatus } : {}),
  }
}

async function notifyBandDrop(
  prisma: PrismaClient,
  input: {
    projectId: string
    projectNumber: string | null
    title: string
    previousBand: HealthBand
    nextBand: HealthBand
    topReason: string
    recipients: string[]
    autoStatus: string | null
  },
): Promise<void> {
  const ref = input.projectNumber ?? input.title
  const summary =
    `Health ${input.previousBand} → ${input.nextBand}: ${input.topReason}` +
    (input.autoStatus ? ` (status auto-set to ${input.autoStatus})` : '')

  await logActivity(prisma, {
    projectId: input.projectId,
    actorId: null, // engine action
    entityType: 'PROJECT',
    entityId: input.projectId,
    action: 'HEALTH_CHANGED',
    summary,
  })

  const unique = [...new Set(input.recipients)]
  for (const targetId of unique) {
    await prisma.pulse
      .create({
        data: {
          type: input.nextBand === 'RED' ? 'ALERT' : 'SIGNAL',
          message: `${ref} is now ${input.nextBand}. ${input.topReason}.`,
          deptName: 'Projects',
          targetId,
          metadata: { projectId: input.projectId, band: input.nextBand } as object,
        },
      })
      .catch((err) => console.error('[projects] band-drop pulse failed:', err?.message))
  }
}

/**
 * Nightly sweep. Health depends on the passage of time — a task becomes
 * overdue and a project becomes stale with no write to trigger a recompute —
 * so scoring cannot be write-driven alone.
 */
export async function recomputeAllProjects(
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ processed: number; changed: number; failed: number }> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { notIn: ['ARCHIVED', 'CANCELLED', 'COMPLETED'] } },
    select: { id: true, healthBand: true },
  })

  let changed = 0
  let failed = 0
  for (const p of projects) {
    try {
      const result = await recomputeProject(prisma, p.id, now)
      if (result && result.health.band !== p.healthBand) changed++
    } catch (err) {
      failed++
      console.error(`[projects] nightly recompute failed for ${p.id}:`, err)
    }
  }
  return { processed: projects.length, changed, failed }
}

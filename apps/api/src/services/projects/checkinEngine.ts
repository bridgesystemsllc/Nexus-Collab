import type { PrismaClient } from '@prisma/client'
import {
  nextCheckinAt, checkinDueAt, reminderStageFor, STAGE_RANK, formatEt,
  type Cadence, type ReminderStage,
} from './cadence'
import { logActivity } from './activity'

// ─── The project manager engine ──────────────────────────────
// Runs hourly. Requests check-ins on cadence, chases them, escalates the ones
// nobody answers, and raises nudges on work that has quietly stalled.
//
// Everything here must be idempotent. The job can be run twice in an hour by a
// redeploy, a retry, or a human testing it, and a system that double-chases
// people is one they learn to ignore. Two mechanisms enforce that:
//   * a unique constraint on (projectId, departmentId, dueAt), so a duplicate
//     request is rejected by the database rather than by a race-prone read;
//   * a recorded reminder stage, so a chase already sent is never re-sent.
//
// Engine actions write activity with actorId = null.

const STATUSES_THAT_CHECK_IN = ['ACTIVE', 'AT_RISK', 'BLOCKED']

export interface EngineResult {
  projectsScanned: number
  checkinsRequested: number
  remindersSent: number
  escalations: number
  markedOverdue: number
  nudges: number
  errors: string[]
}

export async function runCheckinEngine(
  prisma: PrismaClient,
  now = new Date(),
): Promise<EngineResult> {
  const result: EngineResult = {
    projectsScanned: 0, checkinsRequested: 0, remindersSent: 0,
    escalations: 0, markedOverdue: 0, nudges: 0, errors: [],
  }

  await requestDueCheckins(prisma, now, result)
  await chasePendingCheckins(prisma, now, result)
  await raiseNudges(prisma, now, result)

  return result
}

// ─── 1. Request check-ins that have come due ─────────────────

async function requestDueCheckins(prisma: PrismaClient, now: Date, result: EngineResult) {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { in: STATUSES_THAT_CHECK_IN },
      checkinCadence: { not: 'NONE' },
      nextCheckinAt: { lte: now },
    },
    select: {
      id: true, projectNumber: true, title: true, checkinCadence: true,
      checkinDayOfWeek: true, nextCheckinAt: true, projectManagerId: true,
      departments: { select: { departmentId: true, laneLeadId: true, department: { select: { name: true } } } },
    },
  })

  result.projectsScanned = projects.length

  for (const project of projects) {
    try {
      const dueAt = checkinDueAt(now)

      for (const dept of project.departments) {
        // The lane lead owns their department's answer; the PM is the
        // fallback so a lane with no lead still gets chased rather than
        // silently skipped.
        const respondentId = dept.laneLeadId ?? project.projectManagerId ?? null

        try {
          await prisma.projectCheckin.create({
            data: {
              projectId: project.id,
              departmentId: dept.departmentId,
              requestedAt: now,
              dueAt,
              status: 'PENDING',
              respondentId,
            },
          })
          result.checkinsRequested++

          await notify(prisma, respondentId, {
            type: 'SIGNAL',
            message:
              `Check-in requested for ${project.projectNumber ?? project.title}` +
              ` (${dept.department.name}) — due ${formatEt(dueAt)}.`,
            projectId: project.id,
            now,
          })
        } catch (err: any) {
          // P2002 = the unique constraint fired, meaning this exact check-in
          // already exists. That is the idempotency guarantee working, not a
          // failure.
          if (err?.code !== 'P2002') throw err
        }
      }

      // Advance the cadence regardless, so a project whose check-ins all
      // already existed does not get re-scanned every hour forever.
      const next = nextCheckinAt(
        project.checkinCadence as Cadence,
        project.checkinDayOfWeek,
        now,
      )
      await prisma.project.update({
        where: { id: project.id },
        data: { nextCheckinAt: next },
      })

      await logActivity(prisma, {
        projectId: project.id,
        actorId: null,
        entityType: 'CHECKIN',
        action: 'REQUESTED',
        summary:
          `Check-in requested from ${project.departments.length} department(s), due ${formatEt(dueAt)}`,
      })
    } catch (err: any) {
      result.errors.push(`request ${project.id}: ${err?.message ?? err}`)
      console.error(`[checkins] request failed for ${project.id}:`, err)
    }
  }
}

// ─── 2. Chase what is still pending ──────────────────────────

// Maps a stage to the reminderCount value that records it, so an already-sent
// chase is never repeated.
const STAGE_FROM_COUNT = (count: number): ReminderStage => {
  if (count >= 4) return 'OVERDUE_SPONSOR'
  if (count >= 3) return 'OVERDUE_PM'
  if (count >= 2) return 'REMIND_4H'
  if (count >= 1) return 'REMIND_24H'
  return 'NONE'
}

async function chasePendingCheckins(prisma: PrismaClient, now: Date, result: EngineResult) {
  const pending = await prisma.projectCheckin.findMany({
    where: { status: { in: ['PENDING', 'OVERDUE'] } },
    include: {
      department: { select: { name: true } },
      project: {
        select: {
          id: true, projectNumber: true, title: true,
          projectManagerId: true, executiveSponsorId: true, deletedAt: true,
        },
      },
    },
  })

  for (const checkin of pending) {
    try {
      if (checkin.project.deletedAt) continue

      const stage = reminderStageFor(checkin.dueAt, now)
      const alreadyDone = STAGE_FROM_COUNT(checkin.reminderCount)
      if (STAGE_RANK[stage] <= STAGE_RANK[alreadyDone]) continue

      const ref = checkin.project.projectNumber ?? checkin.project.title
      const deptName = checkin.department?.name ?? 'All hands'
      const isOverdue = stage === 'OVERDUE_PM' || stage === 'OVERDUE_SPONSOR'

      if (isOverdue && checkin.status !== 'OVERDUE') {
        await prisma.projectCheckin.update({
          where: { id: checkin.id },
          data: { status: 'OVERDUE' },
        })
        result.markedOverdue++
      }

      const recipients: (string | null)[] = []
      let message: string

      switch (stage) {
        case 'REMIND_24H':
        case 'REMIND_4H':
          recipients.push(checkin.respondentId)
          message =
            `Reminder: ${ref} (${deptName}) check-in is due ${formatEt(checkin.dueAt)}.`
          result.remindersSent++
          break

        case 'OVERDUE_PM':
          // The respondent still gets it — they may simply have missed it —
          // but the PM is now on the hook too.
          recipients.push(checkin.respondentId, checkin.project.projectManagerId)
          message = `${ref} (${deptName}) check-in is overdue.`
          result.escalations++
          break

        case 'OVERDUE_SPONSOR':
          recipients.push(
            checkin.project.projectManagerId,
            checkin.project.executiveSponsorId,
          )
          message =
            `${ref} (${deptName}) check-in has been overdue for more than 24 hours.`
          result.escalations++
          break

        default:
          continue
      }

      for (const target of new Set(recipients.filter(Boolean) as string[])) {
        await notify(prisma, target, {
          type: isOverdue ? 'ALERT' : 'SIGNAL',
          message,
          projectId: checkin.projectId,
          now,
        })
      }

      await prisma.projectCheckin.update({
        where: { id: checkin.id },
        data: {
          reminderCount: STAGE_RANK[stage],
          lastReminderAt: now,
          ...(stage === 'OVERDUE_PM' ? { escalatedAt: now } : {}),
          ...(stage === 'OVERDUE_SPONSOR' ? { sponsorNotifiedAt: now } : {}),
        },
      })

      if (isOverdue) {
        await logActivity(prisma, {
          projectId: checkin.projectId,
          actorId: null,
          departmentId: checkin.departmentId,
          entityType: 'CHECKIN',
          entityId: checkin.id,
          action: 'ESCALATED',
          summary:
            stage === 'OVERDUE_SPONSOR'
              ? `${deptName} check-in escalated to the executive sponsor`
              : `${deptName} check-in is overdue — escalated to the project manager`,
        })
      }
    } catch (err: any) {
      result.errors.push(`chase ${checkin.id}: ${err?.message ?? err}`)
      console.error(`[checkins] chase failed for ${checkin.id}:`, err)
    }
  }
}

// ─── 3. Auto-nudges, independent of cadence ──────────────────
// These fire on work that has stalled rather than on a schedule. Each is
// deduplicated against recent Pulses so a task that stays blocked for a week
// produces one nudge, not seven.

const NUDGE_COOLDOWN_HOURS = 24

async function alreadyNudged(
  prisma: PrismaClient,
  targetId: string,
  marker: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - NUDGE_COOLDOWN_HOURS * 3_600_000)
  const existing = await prisma.pulse.findFirst({
    where: {
      targetId,
      deptName: 'Projects',
      message: { contains: marker },
      createdAt: { gt: since },
    },
  })
  return !!existing
}

async function raiseNudges(prisma: PrismaClient, now: Date, result: EngineResult) {
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000)
  const inSevenDays = new Date(now.getTime() + 7 * 86_400_000)

  // ── Overdue by 2+ days → nudge the assignee ──
  const overdueTasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      dueDate: { lt: twoDaysAgo },
      status: { notIn: ['COMPLETE', 'CANCELLED'] },
      ownerId: { not: null },
      project: { is: { deletedAt: null, status: { in: STATUSES_THAT_CHECK_IN } } },
    },
    select: {
      id: true, title: true, taskNumber: true, ownerId: true, projectId: true,
      project: { select: { projectNumber: true } },
    },
    take: 500,
  })

  for (const t of overdueTasks) {
    try {
      const marker = `task #${t.taskNumber}`
      if (!t.ownerId || await alreadyNudged(prisma, t.ownerId, marker, now)) continue
      await notify(prisma, t.ownerId, {
        type: 'ALERT',
        message: `Overdue ${marker} on ${t.project?.projectNumber ?? 'a project'}: "${t.title}".`,
        projectId: t.projectId ?? undefined,
        now,
      })
      result.nudges++
    } catch (err: any) {
      result.errors.push(`nudge-overdue ${t.id}: ${err?.message ?? err}`)
    }
  }

  // ── Blocked 3+ days → nudge the PM and the lane lead ──
  const stuck = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: 'BLOCKED',
      blockedSince: { lt: threeDaysAgo },
      project: { is: { deletedAt: null, status: { in: STATUSES_THAT_CHECK_IN } } },
    },
    select: {
      id: true, title: true, taskNumber: true, departmentId: true, blockedReason: true,
      projectId: true,
      project: {
        select: {
          projectNumber: true, projectManagerId: true,
          departments: { select: { departmentId: true, laneLeadId: true } },
        },
      },
    },
    take: 500,
  })

  for (const t of stuck) {
    try {
      const marker = `blocked #${t.taskNumber}`
      const laneLead = t.project?.departments.find((d) => d.departmentId === t.departmentId)?.laneLeadId
      const targets = new Set([t.project?.projectManagerId, laneLead].filter(Boolean) as string[])
      for (const target of targets) {
        if (await alreadyNudged(prisma, target, marker, now)) continue
        await notify(prisma, target, {
          type: 'ALERT',
          message:
            `Task ${marker} on ${t.project?.projectNumber ?? 'a project'} has been blocked for 3+ days` +
            `${t.blockedReason ? `: ${t.blockedReason}` : ''}.`,
          projectId: t.projectId ?? undefined,
          now,
        })
        result.nudges++
      }
    } catch (err: any) {
      result.errors.push(`nudge-blocked ${t.id}: ${err?.message ?? err}`)
    }
  }

  // ── Milestone due within 7 days with under half its tasks done ──
  const soon = await prisma.projectMilestone.findMany({
    where: {
      status: { notIn: ['COMPLETE'] },
      dueDate: { gt: now, lt: inSevenDays },
      project: { is: { deletedAt: null, status: { in: STATUSES_THAT_CHECK_IN } } },
    },
    select: {
      id: true, name: true, dueDate: true, departmentId: true, isGate: true, projectId: true,
      project: {
        select: {
          projectNumber: true, projectManagerId: true, executiveSponsorId: true,
          departments: { select: { departmentId: true, laneLeadId: true } },
        },
      },
      tasks: { where: { deletedAt: null }, select: { status: true } },
    },
    take: 300,
  })

  for (const m of soon) {
    try {
      const counted = m.tasks.filter((t) => t.status !== 'CANCELLED')
      if (counted.length === 0) continue
      const done = counted.filter((t) => t.status === 'COMPLETE').length
      if (done / counted.length >= 0.5) continue

      const marker = `milestone "${m.name}"`
      const laneLead = m.project?.departments.find((d) => d.departmentId === m.departmentId)?.laneLeadId
      const target = laneLead ?? m.project?.projectManagerId
      if (!target || await alreadyNudged(prisma, target, marker, now)) continue

      await notify(prisma, target, {
        type: 'ALERT',
        message:
          `${m.isGate ? 'Gate' : 'Milestone'} ${marker} on ${m.project?.projectNumber ?? 'a project'}` +
          ` is due ${formatEt(m.dueDate)} with only ${done} of ${counted.length} tasks complete.`,
        projectId: m.projectId,
        now,
      })
      result.nudges++
    } catch (err: any) {
      result.errors.push(`nudge-milestone ${m.id}: ${err?.message ?? err}`)
    }
  }

  // ── A missed gate goes to the sponsor immediately ──
  const missedGates = await prisma.projectMilestone.findMany({
    where: {
      isGate: true,
      status: { notIn: ['COMPLETE'] },
      dueDate: { lt: now },
      project: { is: { deletedAt: null, status: { in: STATUSES_THAT_CHECK_IN } } },
    },
    select: {
      id: true, name: true, dueDate: true, status: true, projectId: true,
      project: { select: { projectNumber: true, projectManagerId: true, executiveSponsorId: true } },
    },
    take: 200,
  })

  for (const g of missedGates) {
    try {
      if (g.status !== 'MISSED') {
        await prisma.projectMilestone.update({ where: { id: g.id }, data: { status: 'MISSED' } })
      }
      const marker = `gate "${g.name}"`
      const targets = new Set(
        [g.project?.executiveSponsorId, g.project?.projectManagerId].filter(Boolean) as string[],
      )
      for (const target of targets) {
        if (await alreadyNudged(prisma, target, marker, now)) continue
        await notify(prisma, target, {
          type: 'ALERT',
          message: `Missed ${marker} on ${g.project?.projectNumber ?? 'a project'} — due ${formatEt(g.dueDate)}.`,
          projectId: g.projectId,
          now,
        })
        result.nudges++
      }
    } catch (err: any) {
      result.errors.push(`nudge-gate ${g.id}: ${err?.message ?? err}`)
    }
  }
}

// ─── Notification ────────────────────────────────────────────
// In-app Pulse is the delivery channel; a failure is logged and swallowed so
// one bad recipient cannot abort the whole run.

async function notify(
  prisma: PrismaClient,
  targetId: string | null | undefined,
  input: { type: 'ALERT' | 'SIGNAL'; message: string; projectId?: string; now?: Date },
): Promise<void> {
  if (!targetId) return
  try {
    await prisma.pulse.create({
      data: {
        type: input.type,
        message: input.message,
        deptName: 'Projects',
        targetId,
        // Stamped from the engine's clock rather than the database's, so the
        // nudge cooldown compares like with like. If the two can disagree,
        // dedup silently stops working.
        ...(input.now ? { createdAt: input.now } : {}),
        metadata: input.projectId ? ({ projectId: input.projectId } as object) : undefined,
      },
    })
  } catch (err) {
    console.error('[checkins] notify failed:', (err as Error)?.message)
  }
}

/**
 * Seed nextCheckinAt for a project that has a cadence but no schedule yet.
 * Called when a project becomes ACTIVE, so approving a project starts the
 * rhythm without anyone remembering to.
 */
export async function ensureCheckinSchedule(
  prisma: PrismaClient,
  projectId: string,
  now = new Date(),
): Promise<Date | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { checkinCadence: true, checkinDayOfWeek: true, nextCheckinAt: true, status: true },
  })
  if (!project) return null
  if (project.checkinCadence === 'NONE') return null
  if (project.nextCheckinAt) return project.nextCheckinAt
  if (!STATUSES_THAT_CHECK_IN.includes(project.status)) return null

  const next = nextCheckinAt(project.checkinCadence as Cadence, project.checkinDayOfWeek, now)
  if (!next) return null
  await prisma.project.update({ where: { id: projectId }, data: { nextCheckinAt: next } })
  return next
}

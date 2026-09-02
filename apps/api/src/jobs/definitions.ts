import type { PrismaClient } from '@prisma/client'
import { syncErp } from '../lib/erpSync'
import { renewSubscriptions, isSubscriptionConfigured } from '../services/emailAgent/subscription'
import { recomputeAllProjects } from '../services/projects/recompute'
import { runCheckinEngine } from '../services/projects/checkinEngine'
import { runReportSchedule } from '../services/projects/reports/schedule'
import { runDueAutomations, runPendingAutomations } from '../services/automations/runner'

// ─── Background jobs ─────────────────────────────────────────
// Every scheduled job as a plain named function, so the same body can be run
// by the long-running BullMQ worker OR by a one-shot process on a schedule.
//
// They used to live inside `new Worker(...)` closures in worker.ts, which meant
// the only way to run them was an always-on process with a Redis connection.
// The deployment target is Cloud Run, which scales to zero and has no Redis —
// so on the platform this app actually runs on, none of them ever fired.
//
// Every job here is idempotent. That is not incidental: it is what makes a
// scheduler that occasionally double-fires, or a retry after a crash, safe.

export interface JobResult {
  /** One line for the log. */
  summary: string
}

export type JobFn = (prisma: PrismaClient) => Promise<JobResult>

export interface JobDefinition {
  name: string
  /** Which scheduled run this belongs to. See jobs/runDue.ts. */
  group: 'frequent' | 'hourly' | 'nightly' | 'morning'
  description: string
  run: JobFn
}

// ─── Daily briefing ──────────────────────────────────────────

const dailyBriefing: JobFn = async (prisma) => {
  const leaders = await prisma.member.findMany({
    where: { role: { in: ['OPS_MANAGER', 'DEPT_LEAD'] } },
  })

  const tasks = await prisma.task.findMany({
    where: { status: { not: 'COMPLETE' }, deletedAt: null },
    include: { owner: { select: { name: true } } },
    orderBy: { priority: 'asc' },
    take: 20,
  })

  const emergencies = await prisma.moduleItem.findMany({
    where: { status: 'emergency', module: { type: 'INVENTORY_HEALTH' } },
  })

  const critical = tasks.filter((t) => t.priority === 'CRITICAL')

  for (const leader of leaders) {
    await prisma.pulse.create({
      data: {
        type: 'BROADCAST',
        message:
          `Morning Briefing: ${critical.length} critical tasks, ` +
          `${emergencies.length} inventory emergencies, ${tasks.length} total active tasks.`,
        deptName: 'Executive',
        targetId: leader.id,
      },
    })
  }

  return { summary: `briefings sent to ${leaders.length} leaders` }
}

// ─── ERP sync ────────────────────────────────────────────────
// Iterate each ERP_KAREVE_SYNC integration and sync per-org.

const erpSync: JobFn = async (prisma) => {
  const integrations = await prisma.integration.findMany({
    where: { type: 'ERP_KAREVE_SYNC' },
    select: { orgId: true },
  })

  if (integrations.length === 0) {
    return { summary: 'no ERP integrations configured' }
  }

  const results: string[] = []
  for (const integration of integrations) {
    try {
      const result = await syncErp(prisma, integration.orgId)
      const feeds = (result as any)?.feeds ?? {}
      const names = Object.keys(feeds)
      const feedSummary = names.length
        ? names.map((n) => `${n}: ${feeds[n]?.updated ?? 0}`).join(', ')
        : 'no feeds'
      results.push(`org ${integration.orgId.slice(0, 8)}: ${feedSummary}`)
    } catch (err) {
      results.push(`org ${integration.orgId.slice(0, 8)}: error - ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { summary: results.join('; ') }
}

// ─── Automation runner ───────────────────────────────────────
// Process due scheduled automations and pending manual triggers.

const automationRunner: JobFn = async (prisma) => {
  const dueResult = await runDueAutomations(prisma)
  const pendingResult = await runPendingAutomations(prisma)

  const totalProcessed = dueResult.processed + pendingResult.processed
  const totalSucceeded = dueResult.succeeded + pendingResult.succeeded
  const totalFailed = dueResult.failed + pendingResult.failed
  const totalSkipped = dueResult.skipped + pendingResult.skipped

  return {
    summary: totalProcessed === 0
      ? 'no automations due'
      : `${totalProcessed} processed: ${totalSucceeded} ok, ${totalFailed} failed, ${totalSkipped} skipped`,
  }
}

// ─── Overdue-task escalation ─────────────────────────────────

const escalationCheck: JobFn = async (prisma) => {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const overdueTasks = await prisma.task.findMany({
    where: {
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      dueDate: { lt: twentyFourHoursAgo },
      deletedAt: null,
    },
    include: {
      owner: { select: { id: true, name: true } },
      department: { select: { name: true } },
    },
  })

  let raised = 0
  for (const task of overdueTasks) {
    // A pulse for this task in the last day means it has already been raised.
    // This is what makes a double-run cost nothing.
    const existingPulse = await prisma.pulse.findFirst({
      where: {
        message: { contains: task.title },
        type: 'ALERT',
        createdAt: { gt: twentyFourHoursAgo },
      },
    })
    if (existingPulse) continue

    const hoursLate = Math.floor((now.getTime() - (task.dueDate?.getTime() ?? 0)) / 3_600_000)
    await prisma.pulse.create({
      data: {
        type: 'ALERT',
        message:
          `Overdue: "${task.title}" — assigned to ${task.owner?.name || 'Unassigned'}, ` +
          `past due ${hoursLate}h.`,
        deptName: task.department?.name || 'Operations',
        targetId: task.ownerId || undefined,
      },
    })
    raised++
  }

  return { summary: `${overdueTasks.length} overdue tasks, ${raised} newly escalated` }
}

// ─── Graph subscription renewal ──────────────────────────────

const graphSubscriptionRenew: JobFn = async () => {
  if (!isSubscriptionConfigured()) {
    return { summary: 'Graph not configured — skipped' }
  }
  const result = await renewSubscriptions()
  return { summary: typeof result === 'object' && result ? JSON.stringify(result) : 'renewed' }
}

// ─── Project health + daily snapshot ─────────────────────────

const projectHealth: JobFn = async (prisma) => {
  const r = await recomputeAllProjects(prisma)
  return {
    summary:
      `${r.processed} scored, ${r.changed} changed band, ` +
      `${r.snapshots.written} snapshots` +
      (r.failed ? `, ${r.failed} failed` : ''),
  }
}

// ─── Check-in engine ─────────────────────────────────────────

const checkinEngine: JobFn = async (prisma) => {
  const r = await runCheckinEngine(prisma)
  if (r.errors.length) for (const e of r.errors.slice(0, 5)) console.error(`  [checkin-engine] ${e}`)
  return {
    summary:
      `${r.projectsScanned} scanned, ${r.checkinsRequested} requested, ` +
      `${r.remindersSent} reminders, ${r.escalations} escalations, ${r.nudges} nudges` +
      (r.errors.length ? `, ${r.errors.length} errors` : ''),
  }
}

// ─── Scheduled reports ───────────────────────────────────────

const reportSchedule: JobFn = async (prisma) => {
  const r = await runReportSchedule(prisma)
  if (r.errors.length) for (const e of r.errors.slice(0, 5)) console.error(`  [report-schedule] ${e}`)
  return {
    summary:
      `${r.generated} generated, ${r.distributed} emailed, ${r.skipped} already existed` +
      (r.errors.length ? `, ${r.errors.length} errors` : ''),
  }
}

// ─── Registry ────────────────────────────────────────────────
// Groups map onto scheduled runs. Everything is idempotent, so a group firing
// more often than strictly needed wastes a little work and breaks nothing —
// which is the right trade for a scheduler that cannot be trusted to be exact.

export const JOBS: JobDefinition[] = [
  {
    name: 'erp-sync',
    group: 'frequent',
    description: 'Pull ERP inventory and order state',
    run: erpSync,
  },
  {
    name: 'automation-runner',
    group: 'frequent',
    description: 'Execute due scheduled automations and pending manual triggers',
    run: automationRunner,
  },
  {
    name: 'graph-subscription-renew',
    group: 'hourly',
    description: 'Renew the Microsoft Graph mailbox subscription before it expires',
    // Microsoft expires these after ~3 days silently. The renewal window is
    // 24h, so hourly gives an enormous margin and costs one API call.
    run: graphSubscriptionRenew,
  },
  {
    name: 'escalation-check',
    group: 'hourly',
    description: 'Raise a pulse for tasks more than a day overdue',
    run: escalationCheck,
  },
  {
    name: 'checkin-engine',
    group: 'hourly',
    description: 'Request, chase and escalate department check-ins',
    run: checkinEngine,
  },
  {
    name: 'report-schedule',
    group: 'hourly',
    description: 'Generate and email the scheduled reports when they fall due',
    run: reportSchedule,
  },
  {
    name: 'project-health',
    group: 'nightly',
    description: 'Rescore every project and record the daily health snapshot',
    run: projectHealth,
  },
  {
    name: 'daily-briefing',
    group: 'morning',
    description: 'Send each leader their morning briefing pulse',
    run: dailyBriefing,
  },
]

export const JOB_GROUPS = ['frequent', 'hourly', 'nightly', 'morning'] as const
export type JobGroup = (typeof JOB_GROUPS)[number]

export function jobsFor(selector: string): JobDefinition[] {
  if (selector === 'all') return JOBS
  if ((JOB_GROUPS as readonly string[]).includes(selector)) {
    return JOBS.filter((j) => j.group === selector)
  }
  return JOBS.filter((j) => j.name === selector)
}

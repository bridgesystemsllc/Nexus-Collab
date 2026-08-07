import { Worker, Queue } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { syncErp } from './lib/erpSync'
import { renewSubscriptions, isSubscriptionConfigured } from './services/emailAgent/subscription'
import { recomputeAllProjects } from './services/projects/recompute'
import { runCheckinEngine } from './services/projects/checkinEngine'
import { runReportSchedule } from './services/projects/reports/schedule'

const prisma = new PrismaClient()

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })

// ─── Queues ─────────────────────────────────────────────────
export const dailyBriefingQueue = new Queue('daily-briefing', { connection })
export const erpSyncQueue = new Queue('erp-sync', { connection })
export const escalationQueue = new Queue('escalation-check', { connection })
export const graphSubscriptionQueue = new Queue('graph-subscription-renew', { connection })
export const projectHealthQueue = new Queue('project-health', { connection })
export const checkinEngineQueue = new Queue('checkin-engine', { connection })
export const reportScheduleQueue = new Queue('report-schedule', { connection })

// ─── Daily Briefing Worker (9 AM) ───────────────────────────
const briefingWorker = new Worker('daily-briefing', async () => {
  console.log('[worker] Generating daily briefings...')

  const leaders = await prisma.member.findMany({
    where: { role: { in: ['OPS_MANAGER', 'DEPT_LEAD'] } },
  })

  const tasks = await prisma.task.findMany({
    where: { status: { not: 'COMPLETE' } },
    include: { owner: { select: { name: true } } },
    orderBy: { priority: 'asc' },
    take: 20,
  })

  const emergencies = await prisma.moduleItem.findMany({
    where: { status: 'emergency', module: { type: 'INVENTORY_HEALTH' } },
  })

  const critical = tasks.filter((t: any) => t.priority === 'CRITICAL')

  for (const leader of leaders) {
    await prisma.pulse.create({
      data: {
        type: 'BROADCAST',
        message: `Morning Briefing: ${critical.length} critical tasks, ${emergencies.length} inventory emergencies, ${tasks.length} total active tasks.`,
        deptName: 'Executive',
        targetId: leader.id,
      },
    })
  }

  console.log(`[worker] Briefings sent to ${leaders.length} leaders`)
}, { connection })

// ─── ERP Sync Worker (every 15 min) ─────────────────────────
const erpWorker = new Worker('erp-sync', async () => {
  console.log('[worker] Running ERP sync...')

  const integration = await prisma.integration.findFirst({
    where: { type: 'ERP_KAREVE_SYNC' },
  })
  if (!integration) return

  const syncLog = await prisma.syncLog.create({
    data: { integrationId: integration.id, status: 'RUNNING' },
  })

  try {
    // Run the routing-aware orchestrator: each enabled ERP feed flows into its
    // admin-configured Nexus module.
    const result = await syncErp(prisma)
    const recordsProcessed = result.recordsProcessed

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        recordsProcessed,
      },
    })

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncCount: { increment: 1 },
        status: 'CONNECTED',
      },
    })

    console.log(`[worker] ERP sync complete: ${recordsProcessed} records`)
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', errors: { message: String(error) } },
    })
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'ERROR' },
    })
    console.error('[worker] ERP sync failed:', error)
  }
}, { connection })

// ─── Escalation Check Worker (hourly) ───────────────────────
const escalationWorker = new Worker('escalation-check', async () => {
  console.log('[worker] Checking for escalations...')

  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const overdueTasks = await prisma.task.findMany({
    where: {
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      dueDate: { lt: twentyFourHoursAgo },
    },
    include: {
      owner: { select: { id: true, name: true } },
      department: { select: { name: true } },
    },
  })

  for (const task of overdueTasks) {
    // Check if we already created an escalation pulse recently
    const existingPulse = await prisma.pulse.findFirst({
      where: {
        message: { contains: task.title },
        type: 'ALERT',
        createdAt: { gt: twentyFourHoursAgo },
      },
    })

    if (!existingPulse) {
      await prisma.pulse.create({
        data: {
          type: 'ALERT',
          message: `Overdue: "${task.title}" — assigned to ${task.owner?.name || 'Unassigned'}, past due ${Math.floor((now.getTime() - (task.dueDate?.getTime() || 0)) / (1000 * 60 * 60))}h.`,
          deptName: task.department?.name || 'Operations',
          targetId: task.ownerId || undefined,
        },
      })
    }
  }

  console.log(`[worker] Escalation check: ${overdueTasks.length} overdue tasks`)
}, { connection })

// ─── Graph Subscription Renewal Worker (every 12h) ──────────
// Microsoft expires mailbox subscriptions after ~3 days with no warning and no
// error — inbound mail just stops arriving. This job is the only thing keeping
// the email agent and the supplier inventory feeds alive.
const graphSubscriptionWorker = new Worker('graph-subscription-renew', async () => {
  if (!isSubscriptionConfigured()) {
    console.log('[worker] Graph subscription not configured — skipping renewal')
    return
  }

  const results = await renewSubscriptions()
  for (const r of results) {
    if (r.action === 'failed') {
      console.error(`[worker] Graph subscription renewal FAILED: ${r.reason}`)
    } else {
      console.log(`[worker] Graph subscription ${r.action}${r.expiresAt ? ` — expires ${r.expiresAt}` : ''}`)
    }
  }
}, { connection })


// ─── Project Health Sweep (nightly, 2 AM) ───────────────────
// Health depends on the passage of time: a task becomes overdue and a project
// becomes stale with no write to trigger a recompute. Write-driven scoring
// alone would leave a neglected project showing green indefinitely.
const projectHealthWorker = new Worker('project-health', async () => {
  const result = await recomputeAllProjects(prisma)
  console.log(
    `[worker] Project health: ${result.processed} scored, ${result.changed} changed band, ` +
      `${result.snapshots.written} snapshots recorded` +
      (result.failed ? `, ${result.failed} failed` : '') +
      (result.snapshots.failed ? `, ${result.snapshots.failed} snapshots failed` : ''),
  )
}, { connection })


// ─── Check-in Engine (hourly) ───────────────────────────────
// Requests check-ins on cadence, chases them, escalates the ones nobody
// answers, and nudges work that has stalled. Idempotent by construction: a
// unique constraint blocks duplicate requests and a recorded reminder stage
// blocks repeat chases, so a double-run costs nothing.
const checkinEngineWorker = new Worker('checkin-engine', async () => {
  const r = await runCheckinEngine(prisma)
  console.log(
    `[worker] Check-ins: ${r.projectsScanned} scanned, ${r.checkinsRequested} requested, ` +
      `${r.remindersSent} reminders, ${r.escalations} escalations, ${r.nudges} nudges` +
      (r.errors.length ? `, ${r.errors.length} errors` : ''),
  )
  for (const e of r.errors.slice(0, 5)) console.error(`[worker]   ${e}`)
}, { connection })

// ─── Report schedule (hourly) ───────────────────────────────
// Generates and emails the scheduled reports: department digests Monday 07:00
// ET, the portfolio status update Monday 08:00 ET, the executive rollup on the
// 1st at 08:00 ET, and a closeout for any project that completed without one.
// Runs hourly and decides for itself which hour it is in New York, so the
// schedule holds across DST. Idempotent — an existing report for the same
// type, scope and period is skipped rather than duplicated.
const reportScheduleWorker = new Worker('report-schedule', async () => {
  const r = await runReportSchedule(prisma)
  if (r.generated || r.distributed || r.errors.length) {
    console.log(
      `[worker] Reports: ${r.generated} generated, ${r.distributed} emailed, ` +
        `${r.skipped} already existed` + (r.errors.length ? `, ${r.errors.length} errors` : ''),
    )
  }
  for (const e of r.errors.slice(0, 5)) console.error(`[worker]   ${e}`)
}, { connection })

// ─── Schedule recurring jobs ────────────────────────────────
async function scheduleJobs() {
  // Daily briefing at 9 AM
  await dailyBriefingQueue.upsertJobScheduler('daily-briefing-cron', {
    pattern: '0 9 * * *',
  }, { name: 'daily-briefing' })

  // ERP sync every 15 minutes
  await erpSyncQueue.upsertJobScheduler('erp-sync-interval', {
    every: 900_000,
  }, { name: 'erp-sync' })

  // Escalation check every hour
  await escalationQueue.upsertJobScheduler('escalation-interval', {
    every: 3_600_000,
  }, { name: 'escalation-check' })

  // Graph subscription renewal every 12 hours. The renewal window is 24h, so
  // one missed run still leaves a full cycle of margin before expiry.
  await graphSubscriptionQueue.upsertJobScheduler('graph-subscription-interval', {
    every: 43_200_000,
  }, { name: 'graph-subscription-renew' })

  // Project health nightly at 2 AM.
  await projectHealthQueue.upsertJobScheduler('project-health-cron', {
    pattern: '0 2 * * *',
  }, { name: 'project-health' })

  // Check-in engine hourly, on the hour.
  await checkinEngineQueue.upsertJobScheduler('checkin-engine-cron', {
    pattern: '0 * * * *',
  }, { name: 'checkin-engine' })

  // Report schedule hourly, at 5 past — after the check-in engine has run, so
  // a Monday digest reflects check-ins requested the same morning.
  await reportScheduleQueue.upsertJobScheduler('report-schedule-cron', {
    pattern: '5 * * * *',
  }, { name: 'report-schedule' })

  console.log('\n⚡ NEXUS Worker running')
  console.log('📋 Jobs scheduled: daily-briefing (9AM), erp-sync (15min), escalation-check (1hr), graph-subscription-renew (12hr), project-health (2AM), checkin-engine (hourly), report-schedule (hourly)\n')
}

scheduleJobs().catch(console.error)

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] Shutting down...')
  // All of them. A worker left open on SIGTERM keeps its job locked until the
  // lock expires, so the next boot sees the job as still running and skips it.
  await briefingWorker.close()
  await erpWorker.close()
  await escalationWorker.close()
  await graphSubscriptionWorker.close()
  await projectHealthWorker.close()
  await checkinEngineWorker.close()
  await reportScheduleWorker.close()
  await prisma.$disconnect()
  connection.disconnect()
  process.exit(0)
})

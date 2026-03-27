import { Worker, Queue } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })

// ─── Queues ─────────────────────────────────────────────────
export const dailyBriefingQueue = new Queue('daily-briefing', { connection })
export const erpSyncQueue = new Queue('erp-sync', { connection })
export const escalationQueue = new Queue('escalation-check', { connection })

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

  const critical = tasks.filter(t => t.priority === 'CRITICAL')

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
    // In production, this calls the ERP API
    // For now, simulate a sync
    const recordsProcessed = Math.floor(Math.random() * 50) + 10

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

  console.log('\n⚡ NEXUS Worker running')
  console.log('📋 Jobs scheduled: daily-briefing (9AM), erp-sync (15min), escalation-check (1hr)\n')
}

scheduleJobs().catch(console.error)

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] Shutting down...')
  await briefingWorker.close()
  await erpWorker.close()
  await escalationWorker.close()
  await prisma.$disconnect()
  connection.disconnect()
  process.exit(0)
})

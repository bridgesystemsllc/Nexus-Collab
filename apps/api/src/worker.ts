import { Worker, Queue } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from './lib/prisma'
import { JOBS, type JobDefinition } from './jobs/definitions'

// ─── Long-running background worker ──────────────────────────
// A persistent BullMQ worker for deployments that keep a process alive and
// have Redis — a Reserved VM, a container host, or local development.
//
// The job bodies are NOT defined here. They live in jobs/definitions.ts so the
// same code can also be run by jobs/runDue.ts as a one-shot process, which is
// what the Cloud Run deployment uses. Defining them in Worker closures is what
// previously made them unreachable to anything but this file.
//
// Without Redis this exits cleanly with an explanation rather than
// crash-looping on ECONNREFUSED, so a misconfigured deployment says what is
// wrong instead of filling the log with connection errors.

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

// Cron patterns per group. The one-shot runner takes these from its caller's
// scheduler; here the worker owns them.
const SCHEDULES: Record<JobDefinition['group'], { pattern?: string; every?: number }> = {
  frequent: { every: 900_000 },   // every 15 minutes
  hourly: { pattern: '0 * * * *' },
  nightly: { pattern: '0 2 * * *' },
  morning: { pattern: '0 9 * * *' },
}

async function main() {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    // Fail fast on boot instead of retrying forever against a Redis that is
    // not there. The whole point is to tell the operator, not to hide it.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    lazyConnect: true,
  })

  try {
    await connection.connect()
    await connection.ping()
  } catch (err: any) {
    console.error(
      `[worker] Cannot reach Redis at ${redisUrl}: ${err?.message ?? err}\n` +
        `[worker] This worker needs Redis and a process that stays alive.\n` +
        `[worker] On a scale-to-zero host (Cloud Run) use scheduled one-shot runs instead:\n` +
        `[worker]   pnpm --filter @nexus/api jobs hourly\n`,
    )
    connection.disconnect()
    await prisma.$disconnect().catch(() => {})
    process.exitCode = 1
    return
  }

  const queues: Queue[] = []
  const workers: Worker[] = []

  for (const job of JOBS) {
    const queue = new Queue(job.name, { connection })
    queues.push(queue)

    workers.push(
      new Worker(
        job.name,
        async () => {
          const started = Date.now()
          const result = await job.run(prisma)
          console.log(`[worker] ${job.name} (${Date.now() - started}ms) — ${result.summary}`)
        },
        { connection },
      ),
    )

    const schedule = SCHEDULES[job.group]
    await queue.upsertJobScheduler(`${job.name}-scheduler`, schedule, { name: job.name })
  }

  console.log('\n⚡ NEXUS Worker running')
  for (const group of ['frequent', 'hourly', 'nightly', 'morning'] as const) {
    const names = JOBS.filter((j) => j.group === group).map((j) => j.name)
    if (names.length) console.log(`   ${group.padEnd(9)} ${names.join(', ')}`)
  }
  console.log('')

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} — shutting down...`)
    // Every worker, not some. One left open keeps its job locked past
    // shutdown, so the next boot sees it as still running and skips it.
    await Promise.all(workers.map((w) => w.close()))
    await Promise.all(queues.map((q) => q.close()))
    await prisma.$disconnect()
    connection.disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch(async (err) => {
  console.error('[worker] failed to start:', err?.message ?? err)
  await prisma.$disconnect().catch(() => {})
  process.exitCode = 1
})

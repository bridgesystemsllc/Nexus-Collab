import { Router, Request, Response } from 'express'
import { safeEqual } from '../lib/microsoftGraph'
import { prisma } from '../lib/prisma'
import { JOBS, JOB_GROUPS, jobsFor } from '../jobs/definitions'

// ─── Scheduled job trigger ───────────────────────────────────
// Lets an external scheduler run the background jobs against the deployment
// that is already running, with no separate worker process and no Redis.
//
// The deployment target is Cloud Run, which scales to zero — an always-on
// BullMQ worker cannot live there. This endpoint means a cron service (Replit
// Scheduled Deployments, cron-job.org, a GitHub Actions schedule, anything
// that can make an HTTP request) can drive the same jobs.
//
//   curl -X POST https://<app>/api/v1/jobs/run/hourly \
//        -H "Authorization: Bearer $JOBS_TRIGGER_SECRET"
//
// Disabled unless JOBS_TRIGGER_SECRET is set. An unauthenticated endpoint that
// runs background jobs is a denial-of-service handle and, through the report
// job, a way to make the system send email.

export const jobRoutes: ReturnType<typeof Router> = Router()

function isConfigured(): boolean {
  const secret = process.env.JOBS_TRIGGER_SECRET
  // A short secret is worse than none, because it looks protected.
  return !!secret && secret.length >= 16
}

function authorize(req: Request): boolean {
  const secret = process.env.JOBS_TRIGGER_SECRET!
  const header = req.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Also accept a header, which some schedulers find easier than auth headers.
  const alt = req.get('x-jobs-secret') ?? ''
  return (!!bearer && safeEqual(bearer, secret)) || (!!alt && safeEqual(alt, secret))
}

/**
 * A run in progress. Jobs are idempotent, so an overlapping run is safe — but
 * it is wasted work, and two report sweeps racing would both try to generate
 * the same digest. One at a time is enough.
 */
let running: string | null = null

jobRoutes.post('/run/:selector', async (req: Request, res: Response) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: {
        code: 'NotConfigured',
        message:
          'Job triggering is disabled. Set JOBS_TRIGGER_SECRET (32+ random characters) to enable it.',
      },
    })
  }

  if (!authorize(req)) {
    // Deliberately terse: a detailed message here only helps someone guessing.
    return res.status(401).json({ error: { code: 'Unauthorized', message: 'Unauthorized' } })
  }

  const selector = req.params.selector as string
  const jobs = jobsFor(selector)
  if (jobs.length === 0) {
    return res.status(404).json({
      error: {
        code: 'UnknownJob',
        message: `No job or group named "${selector}"`,
        details: { groups: [...JOB_GROUPS, 'all'], jobs: JOBS.map((j) => j.name) },
      },
    })
  }

  if (running) {
    // 409 rather than queueing: the scheduler will call again on its next tick,
    // and a backlog of overlapping sweeps helps nobody.
    return res.status(409).json({
      error: { code: 'AlreadyRunning', message: `A "${running}" run is already in progress` },
    })
  }

  running = selector
  const started = Date.now()
  const results: { job: string; ok: boolean; ms: number; detail: string }[] = []

  try {
    for (const job of jobs) {
      const jobStarted = Date.now()
      try {
        const result = await job.run(prisma)
        results.push({ job: job.name, ok: true, ms: Date.now() - jobStarted, detail: result.summary })
      } catch (err: any) {
        // Per job, so one failure does not abandon the rest of the run.
        const detail = err?.message ?? String(err)
        console.error(`[jobs] ${job.name} failed:`, detail)
        results.push({ job: job.name, ok: false, ms: Date.now() - jobStarted, detail })
      }
    }
  } finally {
    running = null
  }

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`[jobs] ${r.ok ? 'ok  ' : 'FAIL'} ${r.job} (${r.ms}ms) — ${r.detail}`)
  }

  // 207 when some jobs failed: the request itself succeeded and the useful
  // detail is per job, but a scheduler watching status codes must not read a
  // partial failure as a clean run.
  return res.status(failed.length ? 207 : 200).json({
    data: { selector, ran: results.length, failed: failed.length, totalMs: Date.now() - started, results },
  })
})

/** What can be triggered. Also gated — it describes the attack surface. */
jobRoutes.get('/', (req: Request, res: Response) => {
  if (!isConfigured() || !authorize(req)) {
    return res.status(401).json({ error: { code: 'Unauthorized', message: 'Unauthorized' } })
  }
  return res.json({
    data: {
      groups: JOB_GROUPS,
      jobs: JOBS.map((j) => ({ name: j.name, group: j.group, description: j.description })),
      running,
    },
  })
})

export default jobRoutes

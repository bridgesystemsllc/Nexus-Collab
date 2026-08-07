import { prisma } from '../lib/prisma'
import { JOBS, JOB_GROUPS, jobsFor, type JobDefinition } from './definitions'

// ─── One-shot job runner ─────────────────────────────────────
// Runs a group of background jobs once and exits. No HTTP server, no Redis, no
// queue — the caller's scheduler decides when this runs.
//
// This exists because the deployment target is Cloud Run: containers scale to
// zero between requests, so a long-running BullMQ worker cannot live there and
// there is no Redis for it to talk to. A scheduled one-shot process is the
// shape the platform actually supports, and every job is idempotent, so a
// scheduler that double-fires or retries costs nothing.
//
//   tsx src/jobs/runDue.ts hourly           every hour
//   tsx src/jobs/runDue.ts frequent         every 15 minutes
//   tsx src/jobs/runDue.ts nightly          02:00
//   tsx src/jobs/runDue.ts morning          09:00
//   tsx src/jobs/runDue.ts checkin-engine   one job by name
//   tsx src/jobs/runDue.ts all              everything
//
// Exit code is 0 only if every job succeeded, so a scheduler can alert on
// failure instead of silently doing nothing for a week.

async function runOne(job: JobDefinition): Promise<{ ok: boolean; detail: string; ms: number }> {
  const started = Date.now()
  try {
    const result = await job.run(prisma)
    return { ok: true, detail: result.summary, ms: Date.now() - started }
  } catch (err: any) {
    // Caught per job: one failure must not stop the rest of the run, or a
    // broken ERP sync would silently take the check-in engine down with it.
    return {
      ok: false,
      detail: err?.message ?? String(err),
      ms: Date.now() - started,
    }
  }
}

async function main() {
  const selector = process.argv[2] ?? 'hourly'
  const jobs = jobsFor(selector)

  if (jobs.length === 0) {
    console.error(`Unknown job or group: "${selector}"`)
    console.error(`\nGroups: ${JOB_GROUPS.join(', ')}, all`)
    console.error(`Jobs:   ${JOBS.map((j) => j.name).join(', ')}`)
    process.exitCode = 2
    return
  }

  console.log(`[jobs] running "${selector}" — ${jobs.map((j) => j.name).join(', ')}`)

  const failures: string[] = []
  for (const job of jobs) {
    const { ok, detail, ms } = await runOne(job)
    console.log(`[jobs] ${ok ? 'ok  ' : 'FAIL'} ${job.name} (${ms}ms) — ${detail}`)
    if (!ok) failures.push(job.name)
  }

  if (failures.length) {
    console.error(`[jobs] ${failures.length} of ${jobs.length} failed: ${failures.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(`[jobs] ${jobs.length}/${jobs.length} succeeded`)
  }
}

main()
  .catch((err) => {
    // Only reached if something outside a job's own try/catch fails — a bad
    // database URL, say. Distinct exit code so a scheduler can tell "the run
    // could not start" from "a job failed".
    console.error('[jobs] run aborted:', err?.message ?? err)
    process.exitCode = 3
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })

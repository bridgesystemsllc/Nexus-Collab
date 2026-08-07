# Background jobs

The scheduled work behind Nexus: ERP sync, the morning briefing, overdue-task
escalation, Graph subscription renewal, project health scoring, the check-in
engine, and scheduled reports.

## The problem this setup solves

The jobs originally lived inside BullMQ `Worker` closures in `apps/api/src/worker.ts`,
run by a process started with `pnpm dev:worker`. That process was never deployed.
The deployment target is Cloud Run (`.replit` → `deploymentTarget = "cloudrun"`),
which scales to zero between requests and has no Redis — so an always-on
Redis-backed worker cannot run there.

The practical effect: **none of these jobs had ever fired in production.**
No check-ins were requested or escalated, no scheduled reports were generated
or emailed, and the health-trend chart had no data to draw because nothing was
recording daily snapshots.

The job bodies now live in `apps/api/src/jobs/definitions.ts` as plain named
functions, so the same code can be driven three different ways.

## Three ways to run them

### 1. HTTP trigger — works on the current deployment, nothing new to deploy

```
POST /api/v1/jobs/run/:group
Authorization: Bearer $JOBS_TRIGGER_SECRET
```

Point any cron service at it — a Replit Scheduled Deployment, cron-job.org, a
GitHub Actions schedule, Zapier. Disabled unless `JOBS_TRIGGER_SECRET` is set
to 32+ characters (`openssl rand -hex 32`); an unauthenticated endpoint that
runs jobs is a denial-of-service handle and, through the report job, a way to
make the system send email.

Returns `200` when everything succeeded, `207` when some jobs failed (with the
per-job detail), `409` if a run is already in progress.

### 2. Scheduled one-shot process

```
pnpm jobs hourly
pnpm jobs frequent
pnpm jobs nightly
pnpm jobs morning
pnpm jobs checkin-engine     # a single job by name
pnpm jobs all
```

No HTTP server, no Redis. Exits `0` if every job succeeded, `1` if any failed,
`2` on an unknown selector, `3` if the run could not start at all — so a
scheduler can alert instead of silently doing nothing for a week.

### 3. Long-running worker — needs Redis and a process that stays alive

```
pnpm worker
```

For a Reserved VM, a container host, or local development. Uses BullMQ with the
same job definitions. Without Redis it exits with an explanation rather than
crash-looping on ECONNREFUSED.

## Schedule

| Group | Cadence | Jobs |
|---|---|---|
| `frequent` | every 15 min | `erp-sync` |
| `hourly` | hourly | `graph-subscription-renew`, `escalation-check`, `checkin-engine`, `report-schedule` |
| `nightly` | 02:00 | `project-health` (scoring + the daily health snapshot) |
| `morning` | 09:00 | `daily-briefing` |

Times are the operator's choice — the runner does not check the clock, the
scheduler decides. The project jobs that care about time of day
(`report-schedule` sends department digests Monday 07:00 ET) do their own
America/New_York checks internally, so running the group hourly is correct.

## Everything is idempotent

Not incidental — it is what makes this safe:

- `checkin-engine`: a unique constraint on `(project, department, dueAt)` blocks
  duplicate requests; a recorded reminder stage blocks repeat chases.
- `report-schedule`: skips a report that already exists for the same type,
  scope and period.
- `project-health`: snapshots upsert on `(project, ET day)`.
- `escalation-check`: skips a task with an alert pulse in the last 24 hours.

A scheduler that double-fires, retries after a crash, or overlaps two runs
costs a little wasted work and breaks nothing.

## Monitoring

Every run logs one line per job:

```
[jobs] ok   checkin-engine (43ms) — 12 scanned, 3 requested, 1 escalations
[jobs] FAIL erp-sync (2100ms) — connection refused
```

A job that throws is caught per job, so one failure never abandons the rest of
the run.

import { describe, it, expect, vi } from 'vitest'
import { JOBS, JOB_GROUPS, jobsFor } from './definitions'

// The job registry is what the scheduler drives. A job that falls out of a
// group, or a group that quietly empties, means work silently stops happening
// — with no error anywhere, which is how the whole worker went unnoticed as
// non-functional for four phases.

describe('job registry', () => {
  it('every job belongs to a real group', () => {
    for (const job of JOBS) {
      expect(JOB_GROUPS).toContain(job.group)
    }
  })

  it('job names are unique', () => {
    // Duplicates would give two BullMQ queues the same name and make
    // `jobsFor(name)` ambiguous.
    expect(new Set(JOBS.map((j) => j.name)).size).toBe(JOBS.length)
  })

  it('every job has a description, so the trigger endpoint can list itself', () => {
    for (const job of JOBS) expect(job.description.length).toBeGreaterThan(10)
  })

  it('every group has at least one job', () => {
    // An empty group means a scheduled run that does nothing — which looks
    // healthy in a cron dashboard.
    for (const group of JOB_GROUPS) {
      expect(JOBS.filter((j) => j.group === group).length).toBeGreaterThan(0)
    }
  })

  it('covers the three project engines that had never run in production', () => {
    const names = JOBS.map((j) => j.name)
    expect(names).toContain('checkin-engine')
    expect(names).toContain('report-schedule')
    expect(names).toContain('project-health')
  })
})

describe('jobsFor', () => {
  it('resolves a group to its members', () => {
    const hourly = jobsFor('hourly')
    expect(hourly.length).toBeGreaterThan(0)
    expect(hourly.every((j) => j.group === 'hourly')).toBe(true)
  })

  it('resolves a single job by name', () => {
    const one = jobsFor('checkin-engine')
    expect(one).toHaveLength(1)
    expect(one[0]!.name).toBe('checkin-engine')
  })

  it('"all" returns every job exactly once', () => {
    expect(jobsFor('all')).toHaveLength(JOBS.length)
  })

  it('returns nothing for an unknown selector rather than silently running all', () => {
    // Falling back to "everything" on a typo would fire the daily briefing
    // every fifteen minutes.
    expect(jobsFor('nonsense')).toEqual([])
    expect(jobsFor('')).toEqual([])
  })

  it('the union of all groups is every job', () => {
    const viaGroups = JOB_GROUPS.flatMap((g) => jobsFor(g))
    expect(new Set(viaGroups.map((j) => j.name)).size).toBe(JOBS.length)
  })
})

describe('ERP scheduled sync', () => {
  it('only selects connected ERP integrations', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const job = JOBS.find((candidate) => candidate.name === 'erp-sync')
    expect(job).toBeDefined()

    await job!.run({ integration: { findMany } } as any)

    expect(findMany).toHaveBeenCalledWith({
      where: { type: 'ERP_KAREVE_SYNC', status: 'CONNECTED' },
      select: { orgId: true, config: true },
    })
  })

  it('does not sync a connected row whose ERP credentials are missing', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { orgId: 'org_without_credentials', config: { routing: {} } },
    ])
    const job = JOBS.find((candidate) => candidate.name === 'erp-sync')!

    await expect(job.run({ integration: { findMany } } as any)).resolves.toEqual({
      summary: 'no ERP feeds configured',
    })
  })
})

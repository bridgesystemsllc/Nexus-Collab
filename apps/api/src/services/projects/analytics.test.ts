import { describe, it, expect } from 'vitest'
import {
  buildSummary, buildHealthTrend, buildWorkload, buildCycleTime, buildCheckinCompliance,
  type SummaryProject, type WorkloadTask, type CycleProject, type ComplianceCheckin,
} from './analytics'

const NOW = new Date('2026-08-10T12:00:00.000Z')
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const ZERO = { openBlockedTasks: 0, overdueTasks: 0, overdueMilestones: 0, openCriticalRisks: 0 }

const proj = (over: Partial<SummaryProject> = {}): SummaryProject => ({
  id: 'p1', status: 'ACTIVE', priority: 'MEDIUM', health: 80, healthBand: 'GREEN',
  percentComplete: 50, ...over,
})

// ─── Summary ─────────────────────────────────────────────────

describe('buildSummary', () => {
  it('averages completion over active projects only', () => {
    // A finished project parked at 100% would otherwise flatter the average
    // for as long as it exists.
    const s = buildSummary({
      projects: [
        proj({ id: 'a', percentComplete: 20 }),
        proj({ id: 'b', percentComplete: 40 }),
        proj({ id: 'c', percentComplete: 100, status: 'COMPLETED' }),
      ],
      counts: ZERO, now: NOW,
    })
    expect(s.averagePercentComplete).toBe(30)
    expect(s.active).toBe(2)
    expect(s.total).toBe(3)
  })

  it('counts at-risk as anything not green, among active projects', () => {
    const s = buildSummary({
      projects: [
        proj({ id: 'a', healthBand: 'GREEN' }),
        proj({ id: 'b', healthBand: 'AMBER' }),
        proj({ id: 'c', healthBand: 'RED' }),
        proj({ id: 'd', healthBand: 'RED', status: 'ARCHIVED' }),
      ],
      counts: ZERO, now: NOW,
    })
    expect(s.atRisk).toBe(2)
  })

  it('separates due-soon from overdue', () => {
    const s = buildSummary({
      projects: [
        proj({ id: 'a', targetEndDate: day('2026-08-15') }), // within 14 days
        proj({ id: 'b', targetEndDate: day('2026-09-30') }), // beyond
        proj({ id: 'c', targetEndDate: day('2026-08-01') }), // past
      ],
      counts: ZERO, now: NOW,
    })
    expect(s.dueSoon).toBe(1)
    expect(s.overdue).toBe(1)
  })

  it('reports projects with no budget rather than folding them into the spend', () => {
    const s = buildSummary({
      projects: [
        proj({ id: 'a', budgetAmount: 1000, actualSpend: 400 }),
        proj({ id: 'b' }),
      ],
      counts: ZERO, now: NOW,
    })
    expect(s.budget).toMatchObject({
      totalBudget: 1000, totalSpend: 400, percentSpent: 40, projectsWithoutBudget: 1,
    })
  })

  it('returns null percentSpent when nothing is budgeted, not 0', () => {
    const s = buildSummary({ projects: [proj()], counts: ZERO, now: NOW })
    expect(s.budget.percentSpent).toBeNull()
  })

  it('counts only positive slip, ignoring projects delivered early', () => {
    const s = buildSummary({
      projects: [
        proj({ id: 'a', baselineEndDate: day('2026-08-01'), targetEndDate: day('2026-08-11') }),
        proj({ id: 'b', baselineEndDate: day('2026-08-20'), targetEndDate: day('2026-08-10') }),
      ],
      counts: ZERO, now: NOW,
    })
    expect(s.slip).toMatchObject({ projectsSlipping: 1, averageSlipDays: 10, maxSlipDays: 10 })
  })

  it('handles an empty portfolio without dividing by zero', () => {
    const s = buildSummary({ projects: [], counts: ZERO, now: NOW })
    expect(s.averagePercentComplete).toBe(0)
    expect(s.averageHealth).toBe(0)
    expect(s.slip.averageSlipDays).toBe(0)
  })
})

// ─── Health trend ────────────────────────────────────────────

describe('buildHealthTrend', () => {
  it('returns one point per requested day, oldest first', () => {
    const t = buildHealthTrend({ snapshots: [], days: 7, now: NOW })
    expect(t.points).toHaveLength(7)
    expect(t.points[0]!.day).toBe('2026-08-04')
    expect(t.points[6]!.day).toBe('2026-08-10')
  })

  it('counts bands per day', () => {
    const t = buildHealthTrend({
      snapshots: [
        { day: day('2026-08-10'), band: 'GREEN', score: 90 },
        { day: day('2026-08-10'), band: 'GREEN', score: 80 },
        { day: day('2026-08-10'), band: 'RED', score: 30 },
      ],
      days: 3, now: NOW,
    })
    const today = t.points.at(-1)!
    expect(today).toMatchObject({ GREEN: 2, AMBER: 0, RED: 1, total: 3 })
    expect(today.averageScore).toBe(67)
  })

  it('leaves days with no data empty instead of interpolating them', () => {
    // Inventing history is worse than admitting there is none.
    const t = buildHealthTrend({
      snapshots: [{ day: day('2026-08-10'), band: 'GREEN', score: 90 }],
      days: 5, now: NOW,
    })
    expect(t.points.slice(0, 4).every((p) => p.total === 0 && p.averageScore === null)).toBe(true)
  })

  it('reports how far the data actually reaches', () => {
    // So a two-day-old system cannot be drawn as ninety days of steady green.
    const t = buildHealthTrend({
      snapshots: [
        { day: day('2026-08-09'), band: 'GREEN', score: 90 },
        { day: day('2026-08-10'), band: 'AMBER', score: 60 },
      ],
      days: 90, now: NOW,
    })
    expect(t.coverage).toEqual({ daysRequested: 90, daysWithData: 2, firstDay: '2026-08-09' })
  })

  it('ignores a band value it does not recognise rather than throwing', () => {
    const t = buildHealthTrend({
      snapshots: [{ day: day('2026-08-10'), band: 'PURPLE', score: 50 }],
      days: 1, now: NOW,
    })
    expect(t.points[0]).toMatchObject({ GREEN: 0, AMBER: 0, RED: 0, total: 1 })
  })

  it('walks calendar days across a DST transition without skipping one', () => {
    // 2026-11-01 is the autumn change; stepping by fixed ms would duplicate or
    // drop a day here.
    const t = buildHealthTrend({ snapshots: [], days: 5, now: new Date('2026-11-03T17:00:00.000Z') })
    expect(t.points.map((p) => p.day)).toEqual([
      '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03',
    ])
  })
})

// ─── Workload ────────────────────────────────────────────────

const task = (over: Partial<WorkloadTask> = {}): WorkloadTask => ({
  id: 't', status: 'IN_PROGRESS', ownerId: 'm1', ownerName: 'Ana',
  departmentName: 'Operations', ...over,
})

describe('buildWorkload', () => {
  it('counts only open work', () => {
    // Someone who closed forty tasks is not carrying forty tasks.
    const w = buildWorkload({
      tasks: [task({ id: '1' }), task({ id: '2', status: 'COMPLETE' }), task({ id: '3', status: 'CANCELLED' })],
      now: NOW,
    })
    expect(w.assignees[0]!.open).toBe(1)
    expect(w.totals.openTasks).toBe(1)
  })

  it('separates overdue and blocked within a person\'s queue', () => {
    const w = buildWorkload({
      tasks: [
        task({ id: '1', dueDate: day('2026-08-01') }),
        task({ id: '2', status: 'BLOCKED' }),
        task({ id: '3', dueDate: day('2026-09-01') }),
      ],
      now: NOW,
    })
    expect(w.assignees[0]).toMatchObject({ open: 3, overdue: 1, blocked: 1 })
  })

  it('sorts most-overdue first', () => {
    const w = buildWorkload({
      tasks: [
        task({ id: '1', ownerId: 'a', ownerName: 'Ana' }),
        task({ id: '2', ownerId: 'b', ownerName: 'Ben', dueDate: day('2026-08-01') }),
        task({ id: '3', ownerId: 'b', ownerName: 'Ben', dueDate: day('2026-08-02') }),
      ],
      now: NOW,
    })
    expect(w.assignees.map((a) => a.ownerName)).toEqual(['Ben', 'Ana'])
  })

  it('puts unassigned last, however large the pile', () => {
    // It is a queue, not a person, and it would otherwise dominate the table.
    const w = buildWorkload({
      tasks: [
        ...Array.from({ length: 5 }, (_, i) =>
          task({ id: `u${i}`, ownerId: null, ownerName: null, dueDate: day('2026-01-01') })),
        task({ id: 'a', ownerId: 'a', ownerName: 'Ana' }),
      ],
      now: NOW,
    })
    expect(w.assignees.at(-1)!.ownerName).toBe('Unassigned')
    expect(w.totals.unassigned).toBe(5)
    expect(w.totals.peopleWithWork).toBe(1)
  })

  it('returns null estimated hours when nothing is estimated, not zero', () => {
    // 0 hours reads as "no work"; null reads as "not estimated".
    const w = buildWorkload({ tasks: [task({ id: '1' })], now: NOW })
    expect(w.assignees[0]!.estimatedHours).toBeNull()
  })

  it('sums estimated hours when some tasks have them', () => {
    const w = buildWorkload({
      tasks: [task({ id: '1', estimatedHours: 3.5 }), task({ id: '2', estimatedHours: 2 })],
      now: NOW,
    })
    expect(w.assignees[0]!.estimatedHours).toBe(5.5)
  })

  it('handles no tasks at all', () => {
    const w = buildWorkload({ tasks: [], now: NOW })
    expect(w.assignees).toEqual([])
    expect(w.totals.openTasks).toBe(0)
  })
})

// ─── Cycle time ──────────────────────────────────────────────

const cyc = (over: Partial<CycleProject> = {}): CycleProject => ({
  id: 'p', status: 'ACTIVE', typeLabel: 'Launch', ...over,
})

describe('buildCycleTime', () => {
  it('measures actual duration only for completed projects with both dates', () => {
    const c = buildCycleTime({
      projects: [
        cyc({ id: 'a', status: 'COMPLETED', startDate: day('2026-01-01'), actualEndDate: day('2026-01-31') }),
        cyc({ id: 'b', status: 'ACTIVE', startDate: day('2026-01-01') }),
      ],
      now: NOW,
    })
    expect(c.types[0]).toMatchObject({ projects: 2, completed: 1, averageActualDays: 30 })
  })

  it('excludes unbaselined projects from slip and counts them separately', () => {
    // Treating "never planned" as "zero slip" would make it look punctual.
    const c = buildCycleTime({
      projects: [
        cyc({ id: 'a', baselineEndDate: day('2026-08-01'), targetEndDate: day('2026-08-11') }),
        cyc({ id: 'b' }),
      ],
      now: NOW,
    })
    expect(c.types[0]).toMatchObject({ averageSlipDays: 10, withoutBaseline: 1 })
  })

  it('measures slip against the actual end when there is one', () => {
    const c = buildCycleTime({
      projects: [cyc({
        id: 'a', status: 'COMPLETED', startDate: day('2026-01-01'),
        baselineEndDate: day('2026-02-01'), targetEndDate: day('2026-03-01'),
        actualEndDate: day('2026-02-11'),
      })],
      now: NOW,
    })
    // 10 days past baseline, not 28 — the target moved but delivery is what happened.
    expect(c.types[0]!.averageSlipDays).toBe(10)
  })

  it('reports on-time percent over baselined completions only', () => {
    const c = buildCycleTime({
      projects: [
        cyc({ id: 'a', status: 'COMPLETED', startDate: day('2026-01-01'), baselineEndDate: day('2026-02-01'), actualEndDate: day('2026-01-20') }),
        cyc({ id: 'b', status: 'COMPLETED', startDate: day('2026-01-01'), baselineEndDate: day('2026-02-01'), actualEndDate: day('2026-03-01') }),
        cyc({ id: 'c', status: 'COMPLETED', startDate: day('2026-01-01'), actualEndDate: day('2026-03-01') }),
      ],
      now: NOW,
    })
    expect(c.types[0]!.onTimePercent).toBe(50)
  })

  it('returns null rather than 0 for a type with nothing to measure', () => {
    const c = buildCycleTime({ projects: [cyc()], now: NOW })
    expect(c.types[0]).toMatchObject({
      averageActualDays: null, averagePlannedDays: null, averageSlipDays: null, onTimePercent: null,
    })
  })

  it('sorts worst slip first and sinks unmeasurable types to the bottom', () => {
    const c = buildCycleTime({
      projects: [
        cyc({ id: 'a', typeLabel: 'Small', baselineEndDate: day('2026-08-08'), targetEndDate: day('2026-08-10') }),
        cyc({ id: 'b', typeLabel: 'Unmeasured' }),
        cyc({ id: 'c', typeLabel: 'Big', baselineEndDate: day('2026-07-01'), targetEndDate: day('2026-08-10') }),
      ],
      now: NOW,
    })
    expect(c.types.map((t) => t.type)).toEqual(['Big', 'Small', 'Unmeasured'])
  })
})

// ─── Check-in compliance ─────────────────────────────────────

const chk = (over: Partial<ComplianceCheckin> = {}): ComplianceCheckin => ({
  departmentId: 'd1', departmentName: 'Operations', status: 'RESPONDED',
  requestedAt: new Date('2026-08-01T09:00:00.000Z'),
  dueAt: new Date('2026-08-03T09:00:00.000Z'),
  respondedAt: new Date('2026-08-02T09:00:00.000Z'),
  ...over,
})

describe('buildCheckinCompliance', () => {
  it('ignores check-ins whose window is still open', () => {
    // Otherwise a request sent an hour ago scores as non-compliance and every
    // Monday morning looks like a collapse.
    const c = buildCheckinCompliance({
      checkins: [
        chk(),
        chk({ status: 'PENDING', dueAt: new Date('2026-08-20T09:00:00.000Z'), respondedAt: null }),
      ],
      now: NOW,
    })
    expect(c.overall).toMatchObject({ asked: 1, answered: 1, rate: 100, stillOpen: 1 })
  })

  it('counts an answered check-in even if its window is still open', () => {
    const c = buildCheckinCompliance({
      checkins: [chk({ dueAt: new Date('2026-08-20T09:00:00.000Z') })],
      now: NOW,
    })
    expect(c.overall).toMatchObject({ asked: 1, answered: 1, stillOpen: 0 })
  })

  it('scores an unanswered closed check-in against the department', () => {
    const c = buildCheckinCompliance({
      checkins: [chk(), chk({ status: 'OVERDUE', respondedAt: null })],
      now: NOW,
    })
    expect(c.departments[0]).toMatchObject({ asked: 2, answered: 1, rate: 50 })
  })

  it('separates answering at all from answering on time', () => {
    const c = buildCheckinCompliance({
      checkins: [
        chk(),
        chk({ respondedAt: new Date('2026-08-05T09:00:00.000Z') }), // after dueAt
      ],
      now: NOW,
    })
    expect(c.departments[0]).toMatchObject({ rate: 100, onTimeRate: 50 })
  })

  it('reports average turnaround in hours', () => {
    const c = buildCheckinCompliance({
      checkins: [chk({ respondedAt: new Date('2026-08-01T15:00:00.000Z') })],
      now: NOW,
    })
    expect(c.departments[0]!.averageHoursToRespond).toBe(6)
  })

  it('sorts worst compliance first', () => {
    // The table exists to find who is not answering.
    const c = buildCheckinCompliance({
      checkins: [
        chk({ departmentName: 'Good' }),
        chk({ departmentName: 'Bad', status: 'OVERDUE', respondedAt: null }),
      ],
      now: NOW,
    })
    expect(c.departments.map((d) => d.department)).toEqual(['Bad', 'Good'])
  })

  it('buckets department-less check-ins as All hands', () => {
    const c = buildCheckinCompliance({
      checkins: [chk({ departmentId: null, departmentName: null })],
      now: NOW,
    })
    expect(c.departments[0]!.department).toBe('All hands')
  })

  it('returns a zero rate rather than NaN when nothing has closed', () => {
    const c = buildCheckinCompliance({ checkins: [], now: NOW })
    expect(c.overall).toMatchObject({ asked: 0, answered: 0, rate: 0 })
  })
})

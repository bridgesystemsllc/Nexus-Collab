import { describe, it, expect } from 'vitest'
import {
  buildProjectUpdate, buildStatusUpdate, buildExecutiveRollup, buildCloseout,
  slipDays, REPORT_TYPES,
  type ReportProject, type ReportTask, type ReportMilestone, type PortfolioProject,
} from './payload'

const NOW = new Date('2026-08-15T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const PERIOD = { start: d('2026-08-01'), end: d('2026-08-14') }

const project = (over: Partial<ReportProject> = {}): ReportProject => ({
  id: 'p1', projectNumber: 'PRJ-2026-0001', title: 'Test project',
  status: 'ACTIVE', priority: 'HIGH', health: 82, healthBand: 'GREEN',
  percentComplete: 45,
  startDate: d('2026-06-01'), targetEndDate: d('2026-10-01'),
  baselineEndDate: d('2026-09-15'), actualEndDate: null,
  budgetAmount: 100_000, actualSpend: 40_000, currency: 'USD',
  brands: ['Ambi'], retailers: [],
  projectTypeLabel: 'New Product Development',
  ownerDepartmentName: 'R&D', projectManagerName: 'Ahmad G.',
  departments: [{ departmentId: 'rd', name: 'R&D', role: 'OWNER', laneLeadName: 'Ronald M.' }],
  ...over,
})

const task = (over: Partial<ReportTask> = {}): ReportTask => ({
  id: 't1', taskNumber: 1, title: 'A task', status: 'IN_PROGRESS',
  departmentId: 'rd', departmentName: 'R&D', ownerName: 'Tom L.',
  dueDate: d('2026-08-20'), completedAt: null,
  blockedReason: null, blockedSince: null, estimatedHours: 8,
  ...over,
})

const milestone = (over: Partial<ReportMilestone> = {}): ReportMilestone => ({
  id: 'm1', name: 'Gate', dueDate: d('2026-09-01'), baselineDate: d('2026-09-01'),
  completedDate: null, status: 'PENDING', isGate: true, departmentName: 'R&D',
  ...over,
})

const base = { tasks: [], phases: [], milestones: [], risks: [], checkins: [], period: PERIOD, now: NOW }

describe('slipDays', () => {
  it('measures target beyond baseline', () => {
    expect(slipDays(d('2026-09-01'), d('2026-09-13'))).toBe(12)
  })
  it('reports zero when finishing early — early is not slip', () => {
    expect(slipDays(d('2026-09-13'), d('2026-09-01'))).toBe(0)
  })
  it('reports zero with no baseline, since slip needs a committed plan', () => {
    expect(slipDays(null, d('2026-09-01'))).toBe(0)
    expect(slipDays(d('2026-09-01'), null)).toBe(0)
  })
})

describe('determinism — the property the frozen snapshot depends on', () => {
  it('produces byte-identical output for identical inputs', () => {
    const input = {
      ...base,
      project: project(),
      tasks: [task({ id: 'a', status: 'COMPLETE', completedAt: d('2026-08-05') }), task({ id: 'b' })],
      milestones: [milestone()],
    }
    const first = JSON.stringify(buildProjectUpdate(input))
    const second = JSON.stringify(buildProjectUpdate(input))
    expect(first).toBe(second)
  })

  it('orders tied groups deterministically rather than by insertion', () => {
    // Two departments with one completed task each: the tie must break the same
    // way every time, or the payload churns between generations.
    const mk = (dept: string) => ({
      ...base,
      project: project(),
      tasks: [
        task({ id: '1', departmentName: 'Zebra', status: 'COMPLETE', completedAt: d('2026-08-05') }),
        task({ id: '2', departmentName: 'Alpha', status: 'COMPLETE', completedAt: d('2026-08-06') }),
      ],
    })
    const a = buildProjectUpdate(mk('x')).completedThisPeriod.map((g: any) => g.department)
    const b = buildProjectUpdate(mk('y')).completedThisPeriod.map((g: any) => g.department)
    expect(a).toEqual(['Alpha', 'Zebra'])
    expect(a).toEqual(b)
  })

  it('takes `now` as an argument rather than reading the clock', () => {
    const t1 = buildProjectUpdate({ ...base, project: project(), now: new Date('2026-01-01') })
    const t2 = buildProjectUpdate({ ...base, project: project(), now: new Date('2027-01-01') })
    expect(t1.generatedAt).not.toBe(t2.generatedAt)
    // Everything else is stable — only the stamped time differs.
    expect({ ...t1, generatedAt: null }).toEqual({ ...t2, generatedAt: null })
  })
})

describe('buildProjectUpdate', () => {
  it('captures the header a status meeting needs', () => {
    const r = buildProjectUpdate({ ...base, project: project() })
    expect(r.header).toMatchObject({
      projectNumber: 'PRJ-2026-0001', healthBand: 'GREEN', percentComplete: 45,
      projectManager: 'Ahmad G.', ownerDepartment: 'R&D',
    })
    expect(r.header.departments).toEqual([{ name: 'R&D', role: 'OWNER', laneLead: 'Ronald M.' }])
  })

  it('reports project slip against the baseline', () => {
    // baseline 2026-09-15, target 2026-10-01 → 16 days
    expect(buildProjectUpdate({ ...base, project: project() }).timeline.slipDays).toBe(16)
  })

  it('groups completed work by department', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      tasks: [
        task({ id: '1', departmentName: 'R&D', status: 'COMPLETE', completedAt: d('2026-08-05') }),
        task({ id: '2', departmentName: 'R&D', status: 'COMPLETE', completedAt: d('2026-08-06') }),
        task({ id: '3', departmentName: 'Ops', status: 'COMPLETE', completedAt: d('2026-08-07') }),
      ],
    })
    expect(r.completedThisPeriod).toHaveLength(2)
    expect(r.completedThisPeriod.find((g: any) => g.department === 'R&D')?.tasks).toHaveLength(2)
  })

  it('only counts work completed inside the period', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      tasks: [
        task({ id: 'in', status: 'COMPLETE', completedAt: d('2026-08-05') }),
        task({ id: 'before', status: 'COMPLETE', completedAt: d('2026-07-01') }),
        task({ id: 'after', status: 'COMPLETE', completedAt: d('2026-08-30') }),
      ],
    })
    expect(r.completedThisPeriod[0]?.tasks).toHaveLength(1)
  })

  it('sorts blocked tasks longest-blocked first, with age', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      tasks: [
        task({ id: 'new', status: 'BLOCKED', blockedSince: d('2026-08-13'), blockedReason: 'a' }),
        task({ id: 'old', status: 'BLOCKED', blockedSince: d('2026-08-01'), blockedReason: 'b' }),
      ],
    })
    expect((r.blocked[0] as any).daysBlocked).toBe(14)
    expect((r.blocked[1] as any).daysBlocked).toBe(2)
  })

  it('lists only milestones due in the next 30 days that are still open', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      milestones: [
        milestone({ id: 'soon', dueDate: d('2026-08-20') }),
        milestone({ id: 'far', dueDate: d('2026-12-01') }),
        milestone({ id: 'done', dueDate: d('2026-08-20'), status: 'COMPLETE' }),
      ],
    })
    expect(r.milestonesNext30Days).toHaveLength(1)
    expect((r.milestonesNext30Days[0] as any).name).toBe('Gate')
  })

  it('flags an overdue milestone', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      milestones: [milestone({ dueDate: d('2026-08-01') })],
    })
    expect((r.milestonesNext30Days[0] as any).isOverdue).toBe(true)
  })

  it('computes budget variance and percent', () => {
    const r = buildProjectUpdate({ ...base, project: project() })
    expect(r.budget).toMatchObject({ variance: -60_000, percentOfBudget: 40 })
  })

  it('reports null budget rather than dividing by zero', () => {
    const r = buildProjectUpdate({ ...base, project: project({ budgetAmount: null, actualSpend: 500 }) })
    expect(r.budget).toMatchObject({ variance: null, percentOfBudget: null })
  })

  it('treats commitments as dated work beyond the period, not merely open work', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      tasks: [
        task({ id: 'next', dueDate: d('2026-08-25') }),
        task({ id: 'undated', dueDate: null }),
        task({ id: 'thisperiod', dueDate: d('2026-08-10') }),
      ],
    })
    expect(r.nextPeriodCommitments).toHaveLength(1)
    expect((r.nextPeriodCommitments[0] as any).number).toBe(1)
  })

  it('includes only check-ins answered in the period', () => {
    const r = buildProjectUpdate({
      ...base, project: project(),
      checkins: [
        { id: '1', status: 'RESPONDED', confidence: 'ON_TRACK', respondedAt: d('2026-08-05'), dueAt: d('2026-08-06') },
        { id: '2', status: 'PENDING', confidence: null, respondedAt: null, dueAt: d('2026-08-20') },
        { id: '3', status: 'RESPONDED', confidence: 'AT_RISK', respondedAt: d('2026-07-01'), dueAt: d('2026-07-02') },
      ],
    })
    expect(r.checkins).toHaveLength(1)
  })

  it('handles an empty project without throwing', () => {
    const r = buildProjectUpdate({ ...base, project: project() })
    expect(r.completedThisPeriod).toEqual([])
    expect(r.blocked).toEqual([])
    expect(r.milestonesNext30Days).toEqual([])
  })
})

describe('buildStatusUpdate', () => {
  const p = (over: Partial<PortfolioProject> = {}): PortfolioProject => ({
    ...project(), openBlockers: 0, overdueMilestones: 0, previousHealthBand: null, nextGate: null,
    ...over,
  })
  const sBase = {
    blockedTasks: [], overdueMilestones: [], checkinCompliance: [],
    scopeLabel: 'All departments', period: PERIOD, now: NOW,
  }

  it('counts by status and health', () => {
    const r = buildStatusUpdate({
      ...sBase,
      projects: [p({ healthBand: 'GREEN' }), p({ healthBand: 'RED' }), p({ healthBand: 'RED' })],
    })
    expect(r.counts.total).toBe(3)
    expect(r.counts.byHealth[0]).toEqual({ key: 'RED', count: 2 })
  })

  it('reports only projects whose health band actually changed', () => {
    const r = buildStatusUpdate({
      ...sBase,
      projects: [
        p({ title: 'moved', healthBand: 'RED', previousHealthBand: 'AMBER' }),
        p({ title: 'same', healthBand: 'GREEN', previousHealthBand: 'GREEN' }),
        p({ title: 'unknown', healthBand: 'GREEN', previousHealthBand: null }),
      ],
    })
    expect(r.healthChanges).toHaveLength(1)
    expect(r.healthChanges[0]).toMatchObject({ from: 'AMBER', to: 'RED' })
  })

  it('caps at-risk to five, worst health first, and excludes green', () => {
    const projects = Array.from({ length: 8 }, (_, i) =>
      p({ title: `P${i}`, health: 70 - i, healthBand: 'AMBER' }),
    )
    projects.push(p({ title: 'healthy', health: 95, healthBand: 'GREEN' }))
    const r = buildStatusUpdate({ ...sBase, projects })
    expect(r.topAtRisk).toHaveLength(5)
    expect((r.topAtRisk[0] as any).title).toBe('P7')
    expect(r.topAtRisk.every((x: any) => x.healthBand !== 'GREEN')).toBe(true)
  })

  it('surfaces the worst check-in compliance first', () => {
    const r = buildStatusUpdate({
      ...sBase, projects: [],
      checkinCompliance: [
        { department: 'R&D', asked: 4, answered: 4 },
        { department: 'Ops', asked: 4, answered: 1 },
      ],
    })
    expect(r.checkinCompliance[0]).toMatchObject({ department: 'Ops', rate: 25 })
    expect(r.checkinCompliance[1]).toMatchObject({ department: 'R&D', rate: 100 })
  })

  it('reports zero compliance rather than NaN when nothing was asked', () => {
    const r = buildStatusUpdate({
      ...sBase, projects: [],
      checkinCompliance: [{ department: 'New', asked: 0, answered: 0 }],
    })
    expect(r.checkinCompliance[0]?.rate).toBe(0)
  })

  it('ages blocked tasks across the portfolio', () => {
    const r = buildStatusUpdate({
      ...sBase, projects: [],
      blockedTasks: [task({ status: 'BLOCKED', blockedSince: d('2026-08-05') })],
    })
    expect((r.blockedAging[0] as any).daysBlocked).toBe(10)
  })

  it('limits upcoming gates to the next fortnight', () => {
    const r = buildStatusUpdate({
      ...sBase,
      projects: [
        p({ title: 'soon', nextGate: { name: 'G1', due: d('2026-08-20'), isGate: true } }),
        p({ title: 'later', nextGate: { name: 'G2', due: d('2026-10-01'), isGate: true } }),
      ],
    })
    expect(r.upcomingGates).toHaveLength(1)
  })

  it('can be labelled as a department digest', () => {
    const r = buildStatusUpdate({ ...sBase, projects: [], reportType: 'DEPARTMENT_DIGEST' })
    expect(r.reportType).toBe('DEPARTMENT_DIGEST')
  })
})

describe('buildExecutiveRollup', () => {
  const p = (over: Partial<PortfolioProject> = {}): PortfolioProject => ({
    ...project(), openBlockers: 0, overdueMilestones: 0, previousHealthBand: null, nextGate: null,
    ...over,
  })
  const eBase = { cycleTimeByType: [], onTimeMilestonePercent: 80, period: PERIOD, now: NOW }

  it('aggregates budget across projects that have one', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [
        p({ budgetAmount: 100, actualSpend: 50 }),
        p({ budgetAmount: 200, actualSpend: 100 }),
      ],
    })
    expect(r.budget).toMatchObject({ totalBudget: 300, totalSpend: 150, percentSpent: 50 })
  })

  it('states how many projects have no budget rather than hiding them', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [p({ budgetAmount: 100, actualSpend: 50 }), p({ budgetAmount: null })],
    })
    expect(r.budget.projectsWithoutBudget).toBe(1)
    expect(r.budget.totalBudget).toBe(100)
  })

  it('counts projects more than 10% over budget', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [
        p({ budgetAmount: 100, actualSpend: 111 }),
        p({ budgetAmount: 100, actualSpend: 110 }),
      ],
    })
    expect(r.budget.projectsOverBudget).toBe(1)
  })

  it('averages slip across only the projects that are slipping', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [
        p({ baselineEndDate: d('2026-09-01'), targetEndDate: d('2026-09-11') }), // 10
        p({ baselineEndDate: d('2026-09-01'), targetEndDate: d('2026-09-21') }), // 20
        p({ baselineEndDate: d('2026-09-01'), targetEndDate: d('2026-08-01') }), // early → excluded
      ],
    })
    expect(r.slip).toMatchObject({ projectsSlipping: 2, averageSlipDays: 15, maxSlipDays: 20 })
  })

  it('reports zero slip for a portfolio with none, not NaN', () => {
    const r = buildExecutiveRollup({ ...eBase, projects: [p({ baselineEndDate: null })] })
    expect(r.slip).toMatchObject({ projectsSlipping: 0, averageSlipDays: 0, maxSlipDays: 0 })
  })

  it('ranks the top ten by priority then health', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [
        p({ title: 'low', priority: 'LOW', health: 99 }),
        p({ title: 'critical', priority: 'CRITICAL', health: 40 }),
        p({ title: 'high', priority: 'HIGH', health: 90 }),
      ],
    })
    expect(r.topInitiatives.map((x: any) => x.title)).toEqual(['critical', 'high', 'low'])
  })

  it('gives each initiative a one-line status', () => {
    const r = buildExecutiveRollup({
      ...eBase,
      projects: [p({ baselineEndDate: d('2026-09-01'), targetEndDate: d('2026-09-13') })],
    })
    expect((r.topInitiatives[0] as any).status).toContain('12d past baseline')
  })

  it('handles an empty portfolio', () => {
    const r = buildExecutiveRollup({ ...eBase, projects: [] })
    expect(r.healthDistribution).toEqual([])
    expect(r.budget.percentSpent).toBeNull()
  })
})

describe('buildCloseout', () => {
  it('measures total slip against the baseline using the actual end date', () => {
    const r = buildCloseout({
      project: project({ baselineEndDate: d('2026-09-01'), actualEndDate: d('2026-09-21') }),
      tasks: [], milestones: [], risks: [], now: NOW,
    })
    expect(r.dates.totalSlipDays).toBe(20)
  })

  it('falls back to the target when the project has no actual end date', () => {
    const r = buildCloseout({
      project: project({ baselineEndDate: d('2026-09-01'), targetEndDate: d('2026-09-11'), actualEndDate: null }),
      tasks: [], milestones: [], risks: [], now: NOW,
    })
    expect(r.dates.totalSlipDays).toBe(10)
  })

  it('counts delivery by department and flags missed gates', () => {
    const r = buildCloseout({
      project: project(),
      tasks: [
        task({ id: '1', status: 'COMPLETE', departmentName: 'R&D' }),
        task({ id: '2', status: 'COMPLETE', departmentName: 'R&D' }),
        task({ id: '3', status: 'COMPLETE', departmentName: 'Ops' }),
        task({ id: '4', status: 'CANCELLED' }),
      ],
      milestones: [
        milestone({ id: 'a', status: 'MISSED', isGate: true }),
        milestone({ id: 'b', status: 'COMPLETE', isGate: false }),
      ],
      risks: [], now: NOW,
    })
    expect(r.delivery).toMatchObject({
      tasksCompleted: 3, tasksCancelled: 1, milestonesMissed: 1, gatesMissed: 1,
    })
    expect(r.delivery.tasksByDepartment[0]).toEqual({ department: 'R&D', completed: 2 })
  })

  it('carries the retrospective fields the archive gate requires', () => {
    const r = buildCloseout({
      project: project({ lessonsLearned: 'Lock scope earlier.', businessCase: 'Because.' }),
      tasks: [], milestones: [], risks: [], now: NOW,
    })
    expect(r.lessonsLearned).toBe('Lock scope earlier.')
    expect(r.businessCase).toBe('Because.')
  })
})

describe('REPORT_TYPES', () => {
  it('lists all five spec types', () => {
    expect(REPORT_TYPES).toHaveLength(5)
    expect(REPORT_TYPES).toContain('CLOSEOUT')
  })
})

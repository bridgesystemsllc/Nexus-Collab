import { describe, it, expect } from 'vitest'
import {
  computeHealth, bandFor, slipDaysBetween, autoStatusFor, bandWorsened,
  type HealthInput,
} from './health'

const NOW = new Date('2026-08-07T12:00:00Z')

const input = (over: Partial<HealthInput> = {}): HealthInput => ({
  now: NOW,
  status: 'ACTIVE',
  overdueMilestones: 0,
  overdueTasks: 0,
  longBlockedTasks: 0,
  slipDays: 0,
  checkinOverdue: false,
  lastActivityAt: NOW,
  openCriticalRisks: 0,
  budgetAmount: null,
  actualSpend: null,
  ...over,
})

const pointsFor = (result: ReturnType<typeof computeHealth>, code: string) =>
  result.penalties.find((p) => p.code === code)?.points ?? 0

describe('bandFor — boundaries', () => {
  it('maps the documented thresholds exactly', () => {
    expect(bandFor(100)).toBe('GREEN')
    expect(bandFor(80)).toBe('GREEN')
    expect(bandFor(79)).toBe('AMBER')
    expect(bandFor(55)).toBe('AMBER')
    expect(bandFor(54)).toBe('RED')
    expect(bandFor(0)).toBe('RED')
  })
})

describe('a clean project scores 100', () => {
  it('has no penalties at all', () => {
    const r = computeHealth(input())
    expect(r.score).toBe(100)
    expect(r.band).toBe('GREEN')
    expect(r.penalties).toEqual([])
  })
})

describe('individual signals and their caps', () => {
  it('overdue milestones: -10 each, capped at -30', () => {
    expect(pointsFor(computeHealth(input({ overdueMilestones: 1 })), 'OVERDUE_MILESTONES')).toBe(10)
    expect(pointsFor(computeHealth(input({ overdueMilestones: 3 })), 'OVERDUE_MILESTONES')).toBe(30)
    expect(pointsFor(computeHealth(input({ overdueMilestones: 9 })), 'OVERDUE_MILESTONES')).toBe(30)
  })

  it('overdue tasks: -3 each, capped at -20', () => {
    expect(pointsFor(computeHealth(input({ overdueTasks: 1 })), 'OVERDUE_TASKS')).toBe(3)
    expect(pointsFor(computeHealth(input({ overdueTasks: 6 })), 'OVERDUE_TASKS')).toBe(18)
    expect(pointsFor(computeHealth(input({ overdueTasks: 50 })), 'OVERDUE_TASKS')).toBe(20)
  })

  it('long-blocked tasks: -5 each, capped at -15', () => {
    expect(pointsFor(computeHealth(input({ longBlockedTasks: 2 })), 'LONG_BLOCKED')).toBe(10)
    expect(pointsFor(computeHealth(input({ longBlockedTasks: 10 })), 'LONG_BLOCKED')).toBe(15)
  })

  it('schedule slip: -1 per day, capped at -20', () => {
    expect(pointsFor(computeHealth(input({ slipDays: 12 })), 'SCHEDULE_SLIP')).toBe(12)
    expect(pointsFor(computeHealth(input({ slipDays: 90 })), 'SCHEDULE_SLIP')).toBe(20)
  })

  it('critical risks: -15 each, capped at -30', () => {
    expect(pointsFor(computeHealth(input({ openCriticalRisks: 1 })), 'CRITICAL_RISKS')).toBe(15)
    expect(pointsFor(computeHealth(input({ openCriticalRisks: 5 })), 'CRITICAL_RISKS')).toBe(30)
  })

  it('overdue check-in: flat -10', () => {
    expect(pointsFor(computeHealth(input({ checkinOverdue: true })), 'CHECKIN_OVERDUE')).toBe(10)
  })

  it('records the cap that applied, so the breakdown is honest', () => {
    const r = computeHealth(input({ overdueTasks: 50 }))
    expect(r.penalties[0]?.cappedAt).toBe(20)
    expect(r.penalties[0]?.count).toBe(50)
  })
})

describe('staleness', () => {
  it('penalises 14 days of silence but not 13', () => {
    const thirteen = new Date(NOW.getTime() - 13 * 86_400_000)
    const fourteen = new Date(NOW.getTime() - 14 * 86_400_000)
    expect(pointsFor(computeHealth(input({ lastActivityAt: thirteen })), 'NO_ACTIVITY')).toBe(0)
    expect(pointsFor(computeHealth(input({ lastActivityAt: fourteen })), 'NO_ACTIVITY')).toBe(10)
  })

  it('does not penalise a project that has never recorded activity', () => {
    // A brand-new project has no activity yet; that is not staleness.
    expect(pointsFor(computeHealth(input({ lastActivityAt: null })), 'NO_ACTIVITY')).toBe(0)
  })
})

describe('budget', () => {
  it('penalises spend above 110% of budget', () => {
    expect(pointsFor(computeHealth(input({ budgetAmount: 1000, actualSpend: 1101 })), 'OVER_BUDGET')).toBe(10)
  })

  it('does not penalise at exactly 110%', () => {
    expect(pointsFor(computeHealth(input({ budgetAmount: 1000, actualSpend: 1100 })), 'OVER_BUDGET')).toBe(0)
  })

  it('ignores spend when no budget is set, rather than dividing by zero', () => {
    const r = computeHealth(input({ budgetAmount: null, actualSpend: 99999 }))
    expect(pointsFor(r, 'OVER_BUDGET')).toBe(0)
    expect(r.score).toBe(100)
  })

  it('ignores a zero budget', () => {
    expect(pointsFor(computeHealth(input({ budgetAmount: 0, actualSpend: 500 })), 'OVER_BUDGET')).toBe(0)
  })
})

describe('combined scoring', () => {
  it('adds penalties and lands in the right band', () => {
    // 1 overdue milestone (10) + 2 overdue tasks (6) + check-in (10) = 26
    const r = computeHealth(input({ overdueMilestones: 1, overdueTasks: 2, checkinOverdue: true }))
    expect(r.score).toBe(74)
    expect(r.band).toBe('AMBER')
  })

  it('goes RED when the signals stack up', () => {
    const r = computeHealth(input({
      overdueMilestones: 2, overdueTasks: 5, longBlockedTasks: 2,
      slipDays: 9, checkinOverdue: true,
    }))
    // 20 + 15 + 10 + 9 + 10 = 64 -> 36
    expect(r.score).toBe(36)
    expect(r.band).toBe('RED')
  })

  it('never goes below zero even when everything is on fire', () => {
    const r = computeHealth(input({
      overdueMilestones: 20, overdueTasks: 100, longBlockedTasks: 40,
      slipDays: 400, checkinOverdue: true, openCriticalRisks: 10,
      lastActivityAt: new Date(NOW.getTime() - 100 * 86_400_000),
      budgetAmount: 100, actualSpend: 10_000,
    }))
    expect(r.score).toBe(0)
    expect(r.band).toBe('RED')
  })

  it('returns a breakdown, because a score with no explanation is useless', () => {
    const r = computeHealth(input({ overdueMilestones: 2, checkinOverdue: true }))
    expect(r.penalties.map((p) => p.code)).toEqual(['OVERDUE_MILESTONES', 'CHECKIN_OVERDUE'])
    expect(r.penalties[0]?.label).toContain('2 overdue milestones')
    // Singular/plural is handled, since this text is user-facing.
    expect(computeHealth(input({ overdueMilestones: 1 })).penalties[0]?.label)
      .toContain('1 overdue milestone')
  })
})

describe('slipDaysBetween', () => {
  const d = (s: string) => new Date(s)

  it('measures target beyond baseline', () => {
    expect(slipDaysBetween(d('2026-01-01'), d('2026-01-13'))).toBe(12)
  })

  it('reports zero when the target is pulled in — early is not slip', () => {
    expect(slipDaysBetween(d('2026-01-13'), d('2026-01-01'))).toBe(0)
  })

  it('reports zero with no baseline, since slip needs a committed plan', () => {
    expect(slipDaysBetween(null, d('2026-01-01'))).toBe(0)
    expect(slipDaysBetween(d('2026-01-01'), null)).toBe(0)
  })
})

describe('automatic status', () => {
  it('flags an ACTIVE project AT_RISK when it turns RED', () => {
    expect(autoStatusFor('ACTIVE', 'AMBER', 'RED')).toBe('AT_RISK')
  })

  it('never recovers a project automatically', () => {
    // The score can recover for reasons that did not solve anything — an
    // overdue milestone simply being pushed out, for instance.
    expect(autoStatusFor('AT_RISK', 'RED', 'GREEN')).toBeNull()
    expect(autoStatusFor('AT_RISK', 'RED', 'AMBER')).toBeNull()
  })

  it('leaves non-ACTIVE statuses alone', () => {
    expect(autoStatusFor('ON_HOLD', 'GREEN', 'RED')).toBeNull()
    expect(autoStatusFor('COMPLETED', 'GREEN', 'RED')).toBeNull()
    expect(autoStatusFor('DRAFT', 'GREEN', 'RED')).toBeNull()
  })
})

describe('bandWorsened — drives notification, not recovery noise', () => {
  it('is true only when the band gets worse', () => {
    expect(bandWorsened('GREEN', 'AMBER')).toBe(true)
    expect(bandWorsened('AMBER', 'RED')).toBe(true)
    expect(bandWorsened('GREEN', 'RED')).toBe(true)
  })

  it('is false for recovery or no change', () => {
    expect(bandWorsened('RED', 'AMBER')).toBe(false)
    expect(bandWorsened('AMBER', 'AMBER')).toBe(false)
    expect(bandWorsened('RED', 'GREEN')).toBe(false)
  })
})

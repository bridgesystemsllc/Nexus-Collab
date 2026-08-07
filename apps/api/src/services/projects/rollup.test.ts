import { describe, it, expect } from 'vitest'
import {
  effectiveTaskPercent, isCounted, rollupTasks, rollupPhases, rollupProject,
  type RollupTask,
} from './rollup'

const task = (over: Partial<RollupTask> = {}): RollupTask => ({
  id: 't', status: 'IN_PROGRESS', percentComplete: 0, estimatedHours: null, phaseId: null, ...over,
})

describe('effectiveTaskPercent', () => {
  it('forces 100 for COMPLETE regardless of the stored percent', () => {
    expect(effectiveTaskPercent(task({ status: 'COMPLETE', percentComplete: 20 }))).toBe(100)
  })

  it('forces 0 for NOT_STARTED regardless of the stored percent', () => {
    expect(effectiveTaskPercent(task({ status: 'NOT_STARTED', percentComplete: 80 }))).toBe(0)
  })

  it('uses the stored percent while in flight', () => {
    expect(effectiveTaskPercent(task({ status: 'IN_PROGRESS', percentComplete: 45 }))).toBe(45)
    expect(effectiveTaskPercent(task({ status: 'BLOCKED', percentComplete: 30 }))).toBe(30)
  })

  it('clamps nonsense values instead of propagating them', () => {
    expect(effectiveTaskPercent(task({ percentComplete: 150 }))).toBe(100)
    expect(effectiveTaskPercent(task({ percentComplete: -20 }))).toBe(0)
    expect(effectiveTaskPercent(task({ percentComplete: NaN }))).toBe(0)
  })
})

describe('cancelled tasks leave the denominator', () => {
  it('excludes them from isCounted', () => {
    expect(isCounted(task({ status: 'CANCELLED' }))).toBe(false)
    expect(isCounted(task({ status: 'BLOCKED' }))).toBe(true)
  })

  it('does not let cancelling scope inflate completion', () => {
    // 1 of 2 done = 50%. Cancel the unfinished one and it is 100%, not 50%:
    // the cancelled work stopped being part of the plan.
    const both = [task({ status: 'COMPLETE' }), task({ status: 'NOT_STARTED' })]
    expect(rollupTasks(both)).toBe(50)
    const cancelled = [task({ status: 'COMPLETE' }), task({ status: 'CANCELLED' })]
    expect(rollupTasks(cancelled)).toBe(100)
  })

  it('returns 0, not NaN, when everything is cancelled', () => {
    expect(rollupTasks([task({ status: 'CANCELLED' }), task({ status: 'CANCELLED' })])).toBe(0)
  })

  it('returns 0 for an empty set', () => {
    expect(rollupTasks([])).toBe(0)
  })
})

describe('rollupTasks — weighting', () => {
  it('weights by estimated hours when every task has them', () => {
    // 40h done, 10h not: 80% by hours, which is the honest number. Equal
    // weighting would say 50%.
    const tasks = [
      task({ status: 'COMPLETE', estimatedHours: 40 }),
      task({ status: 'NOT_STARTED', estimatedHours: 10 }),
    ]
    expect(rollupTasks(tasks)).toBe(80)
  })

  it('falls back to equal weight when no task is estimated', () => {
    const tasks = [task({ status: 'COMPLETE' }), task({ status: 'NOT_STARTED' })]
    expect(rollupTasks(tasks)).toBe(50)
  })

  it('falls back to equal weight when estimates are only partial', () => {
    // Mixed weighting would treat the unestimated task as one hour and let the
    // 40-hour task dominate. Equal weighting is the safer read.
    const tasks = [
      task({ status: 'COMPLETE', estimatedHours: 40 }),
      task({ status: 'NOT_STARTED', estimatedHours: null }),
    ]
    expect(rollupTasks(tasks)).toBe(50)
  })

  it('ignores zero and negative estimates when deciding to weight', () => {
    const tasks = [
      task({ status: 'COMPLETE', estimatedHours: 40 }),
      task({ status: 'NOT_STARTED', estimatedHours: 0 }),
    ]
    expect(rollupTasks(tasks)).toBe(50)
  })

  it('averages in-flight percentages', () => {
    const tasks = [
      task({ status: 'IN_PROGRESS', percentComplete: 50 }),
      task({ status: 'IN_PROGRESS', percentComplete: 100 }),
    ]
    expect(rollupTasks(tasks)).toBe(75)
  })
})

describe('rollupPhases', () => {
  const phases = [{ id: 'p1' }, { id: 'p2' }]

  it('rolls each phase over its own tasks', () => {
    const tasks = [
      task({ id: 'a', phaseId: 'p1', status: 'COMPLETE' }),
      task({ id: 'b', phaseId: 'p1', status: 'NOT_STARTED' }),
      task({ id: 'c', phaseId: 'p2', status: 'COMPLETE' }),
    ]
    const rolled = rollupPhases(phases, tasks)
    expect(rolled.find((p) => p.phaseId === 'p1')?.percentComplete).toBe(50)
    expect(rolled.find((p) => p.phaseId === 'p2')?.percentComplete).toBe(100)
  })

  it('reports an empty phase as 0 with no task count', () => {
    const rolled = rollupPhases(phases, [])
    expect(rolled[0]).toMatchObject({ percentComplete: 0, taskCount: 0 })
  })

  it('carries estimated hours as the phase weight', () => {
    const tasks = [task({ phaseId: 'p1', estimatedHours: 12 }), task({ phaseId: 'p1', estimatedHours: 8 })]
    expect(rollupPhases(phases, tasks).find((p) => p.phaseId === 'p1')?.weight).toBe(20)
  })
})

describe('rollupProject', () => {
  it('rolls tasks directly when there are no phases', () => {
    const tasks = [task({ status: 'COMPLETE' }), task({ status: 'NOT_STARTED' })]
    expect(rollupProject([], tasks).percentComplete).toBe(50)
  })

  it('weights phases by their hours, not equally', () => {
    // A 90-hour phase at 0% and a 10-hour phase at 100% is 10% complete,
    // not 50%.
    const phases = [{ id: 'big' }, { id: 'small' }]
    const tasks = [
      task({ id: '1', phaseId: 'big', status: 'NOT_STARTED', estimatedHours: 90 }),
      task({ id: '2', phaseId: 'small', status: 'COMPLETE', estimatedHours: 10 }),
    ]
    expect(rollupProject(phases, tasks).percentComplete).toBe(10)
  })

  it('includes unphased tasks so a project cannot read 100% with open work', () => {
    const phases = [{ id: 'p1' }]
    const tasks = [
      task({ id: '1', phaseId: 'p1', status: 'COMPLETE' }),
      task({ id: '2', phaseId: null, status: 'NOT_STARTED' }),
    ]
    const result = rollupProject(phases, tasks)
    expect(result.percentComplete).toBeLessThan(100)
    expect(result.percentComplete).toBe(50)
  })

  it('treats a task pointing at a deleted phase as unphased rather than dropping it', () => {
    const phases = [{ id: 'p1' }]
    const tasks = [
      task({ id: '1', phaseId: 'p1', status: 'COMPLETE' }),
      task({ id: '2', phaseId: 'ghost-phase', status: 'NOT_STARTED' }),
    ]
    expect(rollupProject(phases, tasks).percentComplete).toBe(50)
  })

  it('ignores empty phases so they do not drag the average down', () => {
    const phases = [{ id: 'done' }, { id: 'empty' }]
    const tasks = [task({ phaseId: 'done', status: 'COMPLETE' })]
    expect(rollupProject(phases, tasks).percentComplete).toBe(100)
  })

  it('returns 0 for a project with phases but no tasks', () => {
    expect(rollupProject([{ id: 'p1' }], []).percentComplete).toBe(0)
  })

  it('rounds to two decimals rather than emitting a repeating fraction', () => {
    const tasks = [
      task({ status: 'COMPLETE' }), task({ status: 'NOT_STARTED' }), task({ status: 'NOT_STARTED' }),
    ]
    expect(rollupProject([], tasks).percentComplete).toBe(33.33)
  })
})

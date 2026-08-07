import { describe, it, expect } from 'vitest'
import { computeRipple, describeRipple, type RippleTask, type RippleEdge } from './ripple'

// Dates are plain UTC ISO days throughout, matching what the API returns.
const d = (day: number) => `2026-09-${String(day).padStart(2, '0')}`

const task = (id: string, start: number, due: number): RippleTask => ({
  id, title: `Task ${id}`, taskNumber: Number(id.replace(/\D/g, '')) || null,
  startDate: d(start), dueDate: d(due),
})

const edge = (predecessorId: string, successorId: string, lagDays = 0): RippleEdge => ({
  predecessorId, successorId, dependencyType: 'FS', lagDays,
})

const dayOf = (date: Date | null) => date?.getUTCDate() ?? null

describe('no-op cases', () => {
  it('returns nothing for a zero-day drag', () => {
    const r = computeRipple([task('A', 1, 5)], [], 'A', 0)
    expect(r.shifts).toEqual([])
  })

  it('returns nothing for an unknown task', () => {
    const r = computeRipple([task('A', 1, 5)], [], 'ghost', 3)
    expect(r.shifts).toEqual([])
  })

  it('moves a task with no dependencies and affects nothing else', () => {
    const r = computeRipple([task('A', 1, 5), task('B', 10, 12)], [], 'A', 3)
    expect(r.shifts).toHaveLength(1)
    expect(r.affected).toHaveLength(0)
    expect(dayOf(r.shifts[0]!.toStart)).toBe(4)
    expect(dayOf(r.shifts[0]!.toDue)).toBe(8)
  })
})

describe('forward pressure', () => {
  it('pushes a successor that no longer fits', () => {
    // A: 1–5, B: 5–8. Push A out 3 days; B must start no earlier than the 8th.
    const tasks = [task('A', 1, 5), task('B', 5, 8)]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', 3)

    expect(r.affected).toHaveLength(1)
    const b = r.affected[0]!
    expect(b.id).toBe('B')
    expect(b.shiftDays).toBe(3)
    expect(dayOf(b.toStart)).toBe(8)
    expect(dayOf(b.toDue)).toBe(11)
  })

  it('leaves a successor alone when slack absorbs the move', () => {
    // A: 1–5, B: 20–25. Pushing A by 3 still finishes long before B starts.
    const tasks = [task('A', 1, 5), task('B', 20, 25)]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', 3)
    expect(r.affected).toHaveLength(0)
  })

  it('shifts a successor by only as much as needed, not the full drag', () => {
    // A: 1–5, B: 7–9. Pushing A by 4 means A ends the 9th; B must start the
    // 9th, a shift of 2 — not 4.
    const tasks = [task('A', 1, 5), task('B', 7, 9)]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', 4)
    expect(r.affected[0]!.shiftDays).toBe(2)
  })

  it('honours lag days', () => {
    const tasks = [task('A', 1, 5), task('B', 5, 8)]
    const r = computeRipple(tasks, [edge('A', 'B', 2)], 'A', 3)
    // A now ends the 8th, plus 2 days lag = B starts the 10th.
    expect(dayOf(r.affected[0]!.toStart)).toBe(10)
  })
})

describe('pulling a task earlier does NOT drag successors with it', () => {
  it('leaves successors in place', () => {
    // An earlier finish permits, but does not require, an earlier start.
    const tasks = [task('A', 10, 15), task('B', 15, 20)]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', -5)
    expect(r.affected).toHaveLength(0)
    expect(r.shifts).toHaveLength(1)
    expect(dayOf(r.shifts[0]!.toStart)).toBe(5)
  })
})

describe('cascades', () => {
  it('propagates through a chain', () => {
    const tasks = [task('A', 1, 5), task('B', 5, 8), task('C', 8, 11)]
    const r = computeRipple(tasks, [edge('A', 'B'), edge('B', 'C')], 'A', 4)
    expect(r.affected.map((a) => a.id).sort()).toEqual(['B', 'C'])
    expect(r.affected.every((a) => a.shiftDays === 4)).toBe(true)
  })

  it('stops the cascade where slack absorbs it', () => {
    // A -> B -> C, but C has plenty of slack, so the ripple dies at B.
    const tasks = [task('A', 1, 5), task('B', 5, 8), task('C', 25, 28)]
    const r = computeRipple(tasks, [edge('A', 'B'), edge('B', 'C')], 'A', 3)
    expect(r.affected.map((a) => a.id)).toEqual(['B'])
  })

  it('fans out to multiple successors', () => {
    const tasks = [task('A', 1, 5), task('B', 5, 8), task('C', 5, 9)]
    const r = computeRipple(tasks, [edge('A', 'B'), edge('A', 'C')], 'A', 2)
    expect(r.affected.map((a) => a.id).sort()).toEqual(['B', 'C'])
  })

  it('applies the larger of two converging pressures to a shared successor', () => {
    // D depends on both B and C. B pushes it further than C does.
    const tasks = [task('A', 1, 5), task('B', 5, 12), task('C', 5, 7), task('D', 12, 15)]
    const r = computeRipple(
      tasks,
      [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')],
      'A', 3,
    )
    const d2 = r.affected.find((a) => a.id === 'D')!
    expect(d2.shiftDays).toBe(3)
    expect(dayOf(d2.toStart)).toBe(15)
  })
})

describe('robustness', () => {
  it('aborts rather than hanging on a cyclic graph', () => {
    // The server rejects cycles on write, but corrupt data must not freeze
    // the browser mid-drag.
    const tasks = [task('A', 1, 5), task('B', 5, 8)]
    const r = computeRipple(tasks, [edge('A', 'B'), edge('B', 'A')], 'A', 3)
    expect(r.aborted).toBe(true)
    expect(describeRipple(r)).toContain('loops back')
  })

  it('ignores edges pointing at tasks that are not present', () => {
    const tasks = [task('A', 1, 5)]
    const r = computeRipple(tasks, [edge('A', 'deleted-task')], 'A', 3)
    expect(r.aborted).toBe(false)
    expect(r.affected).toHaveLength(0)
  })

  it('skips successors with no start date rather than inventing one', () => {
    const tasks = [
      task('A', 1, 5),
      { id: 'B', title: 'B', taskNumber: 2, startDate: null, dueDate: null },
    ]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', 3)
    expect(r.affected).toHaveLength(0)
  })

  it('does not model SS/FF/SF, which the UI cannot yet create', () => {
    // Guessing at their semantics would show the user a wrong preview.
    const tasks = [task('A', 1, 5), task('B', 5, 8)]
    const r = computeRipple(tasks, [{ predecessorId: 'A', successorId: 'B', dependencyType: 'SS' }], 'A', 3)
    expect(r.affected).toHaveLength(0)
  })
})

describe('describeRipple', () => {
  it('reports a clean move', () => {
    const r = computeRipple([task('A', 1, 5)], [], 'A', 2)
    expect(describeRipple(r)).toContain('No downstream tasks')
  })

  it('reports the count and the largest shift', () => {
    const tasks = [task('A', 1, 5), task('B', 5, 8), task('C', 8, 11)]
    const r = computeRipple(tasks, [edge('A', 'B'), edge('B', 'C')], 'A', 4)
    const text = describeRipple(r)
    expect(text).toContain('2 downstream tasks')
    expect(text).toContain('4 days')
  })

  it('uses the singular for one task and one day', () => {
    const tasks = [task('A', 1, 5), task('B', 5, 8)]
    const r = computeRipple(tasks, [edge('A', 'B')], 'A', 1)
    expect(describeRipple(r)).toBe('1 downstream task shifts by up to 1 day.')
  })
})

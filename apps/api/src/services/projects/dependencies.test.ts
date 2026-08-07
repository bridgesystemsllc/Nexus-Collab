import { describe, it, expect } from 'vitest'
import {
  findCycle, buildGraph, durationDays, computeCriticalPath,
  DependencyCycleError, type DependencyEdge,
} from './dependencies'

const e = (predecessorId: string, successorId: string): DependencyEdge => ({ predecessorId, successorId })
const day = (n: number) => new Date(Date.UTC(2026, 0, n))

describe('findCycle — direct', () => {
  it('rejects a self-dependency', () => {
    expect(findCycle([], 'A', 'A')).toEqual(['A', 'A'])
  })

  it('rejects the reverse of an existing edge', () => {
    // A -> B exists; adding B -> A closes a two-node loop.
    expect(findCycle([e('A', 'B')], 'B', 'A')).not.toBeNull()
  })

  it('allows a parallel edge in the same direction', () => {
    expect(findCycle([e('A', 'B')], 'A', 'C')).toBeNull()
  })
})

describe('findCycle — indirect (the case a DB constraint cannot catch)', () => {
  it('rejects A -> B -> C -> A', () => {
    const chain = findCycle([e('A', 'B'), e('B', 'C')], 'C', 'A')
    expect(chain).not.toBeNull()
    // The reported chain must actually close the loop.
    expect(chain![0]).toBe('A')
    expect(chain![chain!.length - 1]).toBe('A')
  })

  it('rejects a long chain closing back on itself', () => {
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D'), e('D', 'E'), e('E', 'F')]
    expect(findCycle(edges, 'F', 'A')).not.toBeNull()
  })

  it('rejects a cycle reachable only through a branch', () => {
    // A fans out to B and X; the loop closes through X, not B.
    const edges = [e('A', 'B'), e('A', 'X'), e('X', 'Y')]
    expect(findCycle(edges, 'Y', 'A')).not.toBeNull()
  })

  it('allows a diamond, which is not a cycle', () => {
    // A -> B -> D and A -> C -> D. Adding nothing cyclic.
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D')]
    expect(findCycle(edges, 'C', 'D')).toBeNull()
  })

  it('allows joining two independent chains', () => {
    const edges = [e('A', 'B'), e('C', 'D')]
    expect(findCycle(edges, 'B', 'C')).toBeNull()
  })

  it('terminates on a graph that already contains a disjoint cycle', () => {
    // Pre-existing bad data elsewhere must not hang the check.
    const edges = [e('X', 'Y'), e('Y', 'X'), e('A', 'B')]
    expect(findCycle(edges, 'B', 'C')).toBeNull()
  })

  it('handles a wide graph without revisiting nodes exponentially', () => {
    const edges: DependencyEdge[] = []
    for (let i = 0; i < 200; i++) edges.push(e(`n${i}`, `n${i + 1}`))
    expect(findCycle(edges, 'n200', 'n0')).not.toBeNull()
    expect(findCycle(edges, 'n0', 'n200')).toBeNull()
  })
})

describe('DependencyCycleError', () => {
  it('carries a 409 and names the chain', () => {
    const err = new DependencyCycleError(['A', 'B', 'A'])
    expect(err.status).toBe(409)
    expect(err.chain).toEqual(['A', 'B', 'A'])
    expect(err.message).toContain('A -> B -> A')
  })
})

describe('buildGraph', () => {
  it('groups successors by predecessor', () => {
    const g = buildGraph([e('A', 'B'), e('A', 'C'), e('B', 'D')])
    expect(g.get('A')).toEqual(['B', 'C'])
    expect(g.get('B')).toEqual(['D'])
    expect(g.get('D')).toBeUndefined()
  })
})

describe('durationDays', () => {
  it('measures start to due in days', () => {
    expect(durationDays({ id: 't', startDate: day(1), dueDate: day(6) })).toBe(5)
  })

  it('defaults to one day when dates are missing', () => {
    expect(durationDays({ id: 't' })).toBe(1)
    expect(durationDays({ id: 't', startDate: day(1) })).toBe(1)
    expect(durationDays({ id: 't', dueDate: day(1) })).toBe(1)
  })

  it('never returns zero or negative, so a same-day task still occupies the chain', () => {
    expect(durationDays({ id: 't', startDate: day(5), dueDate: day(5) })).toBe(1)
    expect(durationDays({ id: 't', startDate: day(9), dueDate: day(4) })).toBe(1)
  })
})

describe('computeCriticalPath', () => {
  it('puts a single chain entirely on the critical path', () => {
    const tasks = [
      { id: 'A', startDate: day(1), dueDate: day(3) },   // 2d
      { id: 'B', startDate: day(3), dueDate: day(8) },   // 5d
      { id: 'C', startDate: day(8), dueDate: day(9) },   // 1d
    ]
    const { criticalPath, projectDuration } = computeCriticalPath(tasks, [e('A', 'B'), e('B', 'C')])
    expect([...criticalPath].sort()).toEqual(['A', 'B', 'C'])
    expect(projectDuration).toBe(8)
  })

  it('excludes the shorter branch of a diamond and gives it float', () => {
    //      B (10d)
    //    /        \
    //  A            D
    //    \        /
    //      C (2d)
    const tasks = [
      { id: 'A', startDate: day(1), dueDate: day(2) },    // 1d
      { id: 'B', startDate: day(2), dueDate: day(12) },   // 10d
      { id: 'C', startDate: day(2), dueDate: day(4) },    // 2d
      { id: 'D', startDate: day(12), dueDate: day(13) },  // 1d
    ]
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')]
    const { criticalPath, float } = computeCriticalPath(tasks, edges)

    expect(criticalPath.has('A')).toBe(true)
    expect(criticalPath.has('B')).toBe(true)
    expect(criticalPath.has('D')).toBe(true)
    // C is 8 days shorter than B, so it can slip 8 days without moving D.
    expect(criticalPath.has('C')).toBe(false)
    expect(float.get('C')).toBe(8)
    expect(float.get('B')).toBe(0)
  })

  it('treats unconnected tasks as critical only if they run the full duration', () => {
    const tasks = [
      { id: 'LONG', startDate: day(1), dueDate: day(11) }, // 10d
      { id: 'SHORT', startDate: day(1), dueDate: day(3) }, // 2d
    ]
    const { criticalPath, float, projectDuration } = computeCriticalPath(tasks, [])
    expect(projectDuration).toBe(10)
    expect(criticalPath.has('LONG')).toBe(true)
    expect(criticalPath.has('SHORT')).toBe(false)
    expect(float.get('SHORT')).toBe(8)
  })

  it('handles undated tasks as one-day units', () => {
    const tasks = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
    const { projectDuration, criticalPath } = computeCriticalPath(tasks, [e('A', 'B'), e('B', 'C')])
    expect(projectDuration).toBe(3)
    expect(criticalPath.size).toBe(3)
  })

  it('ignores edges pointing at tasks outside the supplied set', () => {
    const tasks = [{ id: 'A', startDate: day(1), dueDate: day(3) }]
    // 'GHOST' was deleted; its edge must not corrupt the pass.
    expect(() => computeCriticalPath(tasks, [e('A', 'GHOST')])).not.toThrow()
    const { projectDuration } = computeCriticalPath(tasks, [e('A', 'GHOST')])
    expect(projectDuration).toBe(2)
  })

  it('throws rather than looping forever if the stored graph has a cycle', () => {
    const tasks = [{ id: 'A' }, { id: 'B' }]
    expect(() => computeCriticalPath(tasks, [e('A', 'B'), e('B', 'A')])).toThrow(/cycle/i)
  })

  it('returns an empty result for a project with no tasks', () => {
    const { criticalPath, projectDuration } = computeCriticalPath([], [])
    expect(criticalPath.size).toBe(0)
    expect(projectDuration).toBe(0)
  })

  it('verifies the 12-task fixture the acceptance criteria call for', () => {
    // Two parallel chains of six, one clearly longer.
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `L${i}`, startDate: day(1 + i * 5), dueDate: day(6 + i * 5), // 5d each = 30d
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `S${i}`, startDate: day(1 + i * 2), dueDate: day(3 + i * 2), // 2d each = 12d
      })),
    ]
    const edges = [
      ...Array.from({ length: 5 }, (_, i) => e(`L${i}`, `L${i + 1}`)),
      ...Array.from({ length: 5 }, (_, i) => e(`S${i}`, `S${i + 1}`)),
    ]
    const { criticalPath, projectDuration, float } = computeCriticalPath(tasks, edges)
    expect(projectDuration).toBe(30)
    expect([...criticalPath].sort()).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])
    expect(float.get('S0')).toBe(18)
  })
})

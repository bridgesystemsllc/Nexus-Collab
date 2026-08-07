import { describe, it, expect } from 'vitest'
import { groupIntoLanes, resolveCollabDepartments, type BoardTaskInput, type BoardProjectInput } from './collabBridge'

// ─── Fixtures ────────────────────────────────────────────────

const NOW = new Date('2026-08-10T12:00:00.000Z')

const project = (id: string, over: Partial<BoardProjectInput> = {}): BoardProjectInput => ({
  id, projectNumber: `P-${id}`, title: `Project ${id}`, healthBand: 'GREEN', ...over,
})

const task = (over: Partial<BoardTaskInput> = {}): BoardTaskInput => ({
  id: 't1', taskNumber: 1, title: 'A task', status: 'IN_PROGRESS', priority: 'P2',
  dueDate: null, blockedReason: null, isCrossDept: false, acceptanceStatus: null,
  projectId: 'a', departmentId: 'd-ops',
  owner: { id: 'm1', name: 'Ana' },
  department: { id: 'd-ops', name: 'Operations', color: '#111' },
  ...over,
})

const projects = new Map([['a', project('a')], ['b', project('b', { healthBand: 'AMBER' })]])

describe('groupIntoLanes', () => {
  it('swimlanes by department across more than one project', () => {
    const { lanes } = groupIntoLanes(
      [
        task({ id: '1', projectId: 'a', departmentId: 'd-ops' }),
        task({ id: '2', projectId: 'b', departmentId: 'd-ops' }),
        task({
          id: '3', projectId: 'b', departmentId: 'd-mkt',
          department: { id: 'd-mkt', name: 'Marketing', color: '#222' },
        }),
      ],
      projects,
      NOW,
    )

    expect(lanes.map((l) => l.departmentName)).toEqual(['Marketing', 'Operations'])
    expect(lanes.find((l) => l.departmentName === 'Operations')!.cards).toHaveLength(2)
  })

  it('puts a project chip on every card so a card is traceable', () => {
    const { lanes } = groupIntoLanes(
      [task({ id: '1', projectId: 'a' }), task({ id: '2', projectId: 'b' })],
      projects,
      NOW,
    )
    const cards = lanes.flatMap((l) => l.cards)
    expect(cards.map((c) => c.project.title)).toEqual(['Project a', 'Project b'])
    expect(cards.find((c) => c.project.id === 'b')!.project.healthBand).toBe('AMBER')
  })

  it('drops a task whose project is not on the board rather than orphaning it', () => {
    // Happens when a project is unlinked, deleted, or shared summary-only.
    const { lanes, totals } = groupIntoLanes(
      [task({ id: '1', projectId: 'a' }), task({ id: '2', projectId: 'gone' })],
      projects,
      NOW,
    )
    expect(lanes.flatMap((l) => l.cards)).toHaveLength(1)
    expect(totals.tasks).toBe(1)
  })

  it('drops a task with no project at all', () => {
    const { totals } = groupIntoLanes([task({ id: '1', projectId: null })], projects, NOW)
    expect(totals.tasks).toBe(0)
  })

  it('collects unassigned tasks into their own lane, sorted last', () => {
    const { lanes } = groupIntoLanes(
      [
        task({ id: '1', departmentId: null, department: null }),
        task({
          id: '2', departmentId: 'd-mkt',
          department: { id: 'd-mkt', name: 'Marketing', color: null },
        }),
      ],
      projects,
      NOW,
    )
    expect(lanes.map((l) => l.departmentName)).toEqual(['Marketing', 'Unassigned'])
    expect(lanes[1]!.departmentId).toBeNull()
  })

  it('sorts departments alphabetically so the board does not reshuffle between loads', () => {
    const mk = (id: string, name: string) =>
      task({ id, departmentId: id, department: { id, name, color: null } })
    const { lanes } = groupIntoLanes([mk('z', 'Warehouse'), mk('a', 'Finance'), mk('m', 'R&D')], projects, NOW)
    expect(lanes.map((l) => l.departmentName)).toEqual(['Finance', 'R&D', 'Warehouse'])
  })

  it('counts blocked tasks', () => {
    const { totals } = groupIntoLanes(
      [task({ id: '1', status: 'BLOCKED' }), task({ id: '2', status: 'BLOCKED' }), task({ id: '3' })],
      projects,
      NOW,
    )
    expect(totals).toMatchObject({ tasks: 3, blocked: 2 })
  })

  it('counts an overdue task', () => {
    const { totals } = groupIntoLanes(
      [task({ id: '1', dueDate: new Date('2026-08-01T00:00:00.000Z') })],
      projects,
      NOW,
    )
    expect(totals.overdue).toBe(1)
  })

  it('does not count a completed task as overdue, however late it was', () => {
    const { totals } = groupIntoLanes(
      [task({ id: '1', status: 'COMPLETE', dueDate: new Date('2026-01-01T00:00:00.000Z') })],
      projects,
      NOW,
    )
    expect(totals.overdue).toBe(0)
  })

  it('does not count a task due later today as overdue', () => {
    const { totals } = groupIntoLanes(
      [task({ id: '1', dueDate: new Date('2026-08-10T23:00:00.000Z') })],
      projects,
      NOW,
    )
    expect(totals.overdue).toBe(0)
  })

  it('carries the cross-department request fields onto the card', () => {
    const { lanes } = groupIntoLanes(
      [task({ id: '1', isCrossDept: true, acceptanceStatus: 'PENDING' })],
      projects,
      NOW,
    )
    expect(lanes[0]!.cards[0]).toMatchObject({ isCrossDept: true, acceptanceStatus: 'PENDING' })
  })

  it('returns an empty board rather than throwing on no tasks', () => {
    expect(groupIntoLanes([], projects, NOW)).toEqual({
      lanes: [], totals: { tasks: 0, blocked: 0, overdue: 0 },
    })
  })
})

// ─── Department name resolution ──────────────────────────────
// CoworkSpace.deptNames holds display names, not ids. This is the join, and a
// silent miss here means a link that grants nobody access while reporting
// success.

const fakePrisma = (names: string[]) =>
  ({
    department: {
      findMany: async () => names.map((n) => ({ id: `id-${n.toLowerCase()}`, name: n })),
    },
  }) as any

describe('resolveCollabDepartments', () => {
  it('matches by name', async () => {
    const r = await resolveCollabDepartments(fakePrisma(['Operations', 'Marketing']), ['Operations'], 'org')
    expect(r.matched).toEqual([{ id: 'id-operations', name: 'Operations' }])
    expect(r.unmatched).toEqual([])
  })

  it('matches case- and whitespace-insensitively', async () => {
    const r = await resolveCollabDepartments(
      fakePrisma(['Operations']), ['  operations  ', 'OPERATIONS'], 'org',
    )
    // Both resolve to the same department, and it is only returned once.
    expect(r.matched).toHaveLength(1)
    expect(r.unmatched).toEqual([])
  })

  it('reports an unmatched name instead of silently dropping it', async () => {
    // A renamed or deleted department must not make a link quietly do nothing.
    const r = await resolveCollabDepartments(fakePrisma(['Operations']), ['Operations', 'Legal'], 'org')
    expect(r.matched.map((m) => m.name)).toEqual(['Operations'])
    expect(r.unmatched).toEqual(['Legal'])
  })

  it('preserves the order the collab listed its departments in', async () => {
    const r = await resolveCollabDepartments(
      fakePrisma(['Finance', 'Operations', 'Marketing']),
      ['Marketing', 'Finance'],
      'org',
    )
    expect(r.matched.map((m) => m.name)).toEqual(['Marketing', 'Finance'])
  })

  it('short-circuits on an empty list without querying', async () => {
    const prisma = {
      department: { findMany: async () => { throw new Error('should not query') } },
    } as any
    expect(await resolveCollabDepartments(prisma, [], 'org')).toEqual({ matched: [], unmatched: [] })
  })
})

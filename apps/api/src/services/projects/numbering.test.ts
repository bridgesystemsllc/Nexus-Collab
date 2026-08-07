import { describe, it, expect } from 'vitest'
import { allocateProjectNumber, formatProjectNumber } from './numbering'

// ─── Project number allocation ───────────────────────────────
// Regression cover for a real failure: the demo seed claimed PRJ-2026-0101
// through 0106 without advancing the counter, so the allocator handed out a
// number that already existed. Creating any project then returned
// "Something went wrong" — permanently, because every retry produced the same
// number. Nothing in the system could recover without someone editing the
// counter row by hand.
//
// A fake transaction client rather than a database: the behaviour under test
// is which numbers the allocator emits and how it reacts to collisions, and
// that is fully determined by these two calls.

function fakeTx(opts: { counter?: number | null; taken?: string[] } = {}) {
  const state = { lastValue: opts.counter ?? null as number | null }
  const taken = new Set(opts.taken ?? [])
  const calls = { increments: 0, lookups: 0 }

  const tx = {
    projectNumberCounter: {
      async updateMany() {
        if (state.lastValue === null) return { count: 0 }
        state.lastValue++
        calls.increments++
        return { count: 1 }
      },
      async findUnique() {
        return state.lastValue === null ? null : { lastValue: state.lastValue }
      },
      async create({ data }: any) {
        state.lastValue = data.lastValue
        calls.increments++
        return { lastValue: data.lastValue }
      },
      async update() {
        state.lastValue = (state.lastValue ?? 0) + 1
        calls.increments++
        return { lastValue: state.lastValue }
      },
    },
    project: {
      async findFirst({ where }: any) {
        calls.lookups++
        return taken.has(where.projectNumber) ? { id: 'x' } : null
      },
    },
  }
  return { tx: tx as any, state, calls }
}

describe('formatProjectNumber', () => {
  it('pads to four digits', () => {
    expect(formatProjectNumber(2026, 1)).toBe('PRJ-2026-0001')
    expect(formatProjectNumber(2026, 106)).toBe('PRJ-2026-0106')
  })

  it('does not truncate past four digits', () => {
    expect(formatProjectNumber(2026, 12345)).toBe('PRJ-2026-12345')
  })
})

describe('allocateProjectNumber', () => {
  it('returns the next number from the counter', async () => {
    const { tx } = fakeTx({ counter: 10 })
    expect(await allocateProjectNumber(tx, 'org', 2026)).toBe('PRJ-2026-0011')
  })

  it('creates the counter for the first project of a year', async () => {
    const { tx, state } = fakeTx({ counter: null })
    expect(await allocateProjectNumber(tx, 'org', 2026)).toBe('PRJ-2026-0001')
    expect(state.lastValue).toBe(1)
  })

  it('skips a number that already exists', async () => {
    // The exact production failure: seeded projects hold the next number.
    const { tx } = fakeTx({ counter: 100, taken: ['PRJ-2026-0101'] })
    expect(await allocateProjectNumber(tx, 'org', 2026)).toBe('PRJ-2026-0102')
  })

  it('steps over a whole contiguous block, as a seed or import leaves behind', async () => {
    const { tx, state } = fakeTx({
      counter: 100,
      taken: [
        'PRJ-2026-0101', 'PRJ-2026-0102', 'PRJ-2026-0103',
        'PRJ-2026-0104', 'PRJ-2026-0105', 'PRJ-2026-0106',
      ],
    })
    expect(await allocateProjectNumber(tx, 'org', 2026)).toBe('PRJ-2026-0107')
    // The counter catches up as a side effect, so the next call is cheap.
    expect(state.lastValue).toBe(107)
  })

  it('costs one lookup when nothing is in the way', async () => {
    // The skip check must not turn every allocation into a scan.
    const { tx, calls } = fakeTx({ counter: 5 })
    await allocateProjectNumber(tx, 'org', 2026)
    expect(calls.lookups).toBe(1)
    expect(calls.increments).toBe(1)
  })

  it('gives up with a message that names the cause rather than spinning', async () => {
    // Every number taken — a counter reset on a large workspace.
    const taken = Array.from({ length: 2000 }, (_, i) => formatProjectNumber(2026, i + 1))
    const { tx } = fakeTx({ counter: 0, taken })
    await expect(allocateProjectNumber(tx, 'org', 2026)).rejects.toThrow(/out of sync/i)
  })

  it('is monotonic across consecutive calls', async () => {
    const { tx } = fakeTx({ counter: 0 })
    const numbers = []
    for (let i = 0; i < 5; i++) numbers.push(await allocateProjectNumber(tx, 'org', 2026))
    expect(numbers).toEqual([
      'PRJ-2026-0001', 'PRJ-2026-0002', 'PRJ-2026-0003', 'PRJ-2026-0004', 'PRJ-2026-0005',
    ])
  })

  it('never reuses a number it has already handed out in this run', async () => {
    const { tx } = fakeTx({ counter: 0, taken: ['PRJ-2026-0002', 'PRJ-2026-0004'] })
    const numbers = []
    for (let i = 0; i < 3; i++) numbers.push(await allocateProjectNumber(tx, 'org', 2026))
    expect(new Set(numbers).size).toBe(3)
    expect(numbers).toEqual(['PRJ-2026-0001', 'PRJ-2026-0003', 'PRJ-2026-0005'])
  })
})

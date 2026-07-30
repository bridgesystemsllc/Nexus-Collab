import { describe, it, expect } from 'vitest'
import { evaluateGuard } from './importInventorySnapshot'
import type { FeedGuard } from './feedConfig'

const GUARD: FeedGuard = { minRowRatio: 0.7, maxBadRowRatio: 0.1 }

describe('evaluateGuard — first run', () => {
  it('lets an import through when there is no baseline to compare against', () => {
    expect(evaluateGuard(800, 0, null, GUARD)).toEqual({ ok: true })
  })

  it('treats a zero baseline as no baseline', () => {
    expect(evaluateGuard(5, 0, 0, GUARD)).toEqual({ ok: true })
  })
})

describe('evaluateGuard — row count collapse', () => {
  it('allows a count exactly on the floor', () => {
    expect(evaluateGuard(700, 0, 1000, GUARD).ok).toBe(true)
  })

  it('allows a count above the floor', () => {
    expect(evaluateGuard(950, 0, 1000, GUARD).ok).toBe(true)
  })

  it('allows growth well beyond the baseline', () => {
    expect(evaluateGuard(5000, 0, 1000, GUARD).ok).toBe(true)
  })

  it('holds a truncated report below the floor', () => {
    const verdict = evaluateGuard(699, 0, 1000, GUARD)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('699')
    expect(verdict.reason).toContain('1000')
    expect(verdict.reason).toContain('nothing was changed')
  })

  it('holds the catastrophic case of a nearly empty report', () => {
    expect(evaluateGuard(3, 0, 812, GUARD).ok).toBe(false)
  })
})

describe('evaluateGuard — unreadable rows', () => {
  it('allows a bad-row ratio on the limit', () => {
    // 10 bad of 100 total is exactly 10%, which is not above the limit.
    expect(evaluateGuard(90, 10, 100, GUARD).ok).toBe(true)
  })

  it('holds when unreadable rows exceed the limit', () => {
    const verdict = evaluateGuard(80, 20, 100, GUARD)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('malformed')
  })

  it('holds a file with no usable rows at all', () => {
    const verdict = evaluateGuard(0, 0, null, GUARD)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('no usable rows')
  })

  it('checks readability before row count, so a malformed file reports as malformed', () => {
    // Both conditions trip; the more specific diagnosis should win.
    const verdict = evaluateGuard(10, 40, 1000, GUARD)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('malformed')
  })
})

describe('evaluateGuard — configurable thresholds', () => {
  it('honours a stricter floor', () => {
    const strict: FeedGuard = { minRowRatio: 0.95, maxBadRowRatio: 0.1 }
    expect(evaluateGuard(900, 0, 1000, strict).ok).toBe(false)
  })

  it('honours a disabled floor', () => {
    const lenient: FeedGuard = { minRowRatio: 0, maxBadRowRatio: 1 }
    expect(evaluateGuard(1, 0, 1000, lenient).ok).toBe(true)
  })
})

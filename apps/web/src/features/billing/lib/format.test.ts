import { describe, it, expect } from 'vitest'
import { formatMoney, formatDate, daysUntil, seatSegments } from './format'

// Currency and seat maths are the two places a billing UI lies to someone.
// Both are pure here so they can be tested rather than eyeballed.

describe('formatMoney', () => {
  it('renders whole dollars from cents', () => expect(formatMoney(5900)).toBe('$59.00'))
  it('renders zero as $0.00, never as blank or a dash', () => expect(formatMoney(0)).toBe('$0.00'))
  it('groups thousands', () => expect(formatMoney(1234567)).toBe('$12,345.67'))
  it('never loses a trailing cent to float maths', () => {
    // 2341 cents is the prorated figure in the spec's own example; a float
    // round-trip renders it $23.40 and the number on screen stops matching
    // the number charged.
    expect(formatMoney(2341)).toBe('$23.41')
  })
  it('honours a non-USD currency', () => expect(formatMoney(5900, 'cad')).toContain('59.00'))
})

describe('formatDate', () => {
  it('renders a normal date', () => expect(formatDate('2026-09-09T12:00:00Z')).toBe('Sep 9, 2026'))
  it('renders a null date as an em dash, not blank', () => expect(formatDate(null)).toBe('—'))
})

describe('daysUntil', () => {
  const now = new Date('2026-08-30T12:00:00Z')
  it('counts whole days ahead', () => expect(daysUntil('2026-09-09T12:00:00Z', now)).toBe(10))
  it('is 0 on the day itself', () => expect(daysUntil('2026-08-30T23:00:00Z', now)).toBe(0))
  it('never returns negative — a past date is 0, not -3', () => {
    // "Renews in -3 days" is the kind of thing that ships.
    expect(daysUntil('2026-08-27T12:00:00Z', now)).toBe(0)
  })
  it('returns null for a null date rather than NaN', () => expect(daysUntil(null, now)).toBeNull())
  it('returns null for an unparseable date rather than NaN', () => {
    expect(daysUntil('not-a-date', now)).toBeNull()
  })
  it('is 1 day when the renewal falls tomorrow by the calendar, even under 24h away', () => {
    // 20 hours out, but a different calendar day. Math.floor gives 0 here and
    // renders "renews today" the evening before a morning charge.
    expect(daysUntil('2026-08-31T08:00:00Z', new Date('2026-08-30T12:00:00Z'))).toBe(1)
  })
})

describe('seatSegments', () => {
  it('returns one segment per seat when the count is small', () => {
    const s = seatSegments(15, 12)
    expect(s.mode).toBe('segmented')
    expect(s.segments).toHaveLength(15)
    expect(s.segments.filter((f) => f).length).toBe(12)
  })
  it('switches to a continuous bar above the segment ceiling', () => {
    const s = seatSegments(250, 100)
    expect(s.mode).toBe('continuous')
    expect(s.fraction).toBeCloseTo(0.4)
  })
  it('clamps an oversold state to full rather than overflowing', () => {
    // Should be unreachable — the DB trigger forbids it — but a bar drawn at
    // 120% width breaks the layout and tells the user something false.
    const s = seatSegments(10, 12)
    expect(s.fraction).toBe(1)
    expect(s.segments.filter((f) => f).length).toBe(10)
  })
  it('handles the zero-seat case without dividing by zero', () => {
    const s = seatSegments(0, 0)
    expect(s.fraction).toBe(0)
    expect(s.segments).toHaveLength(0)
  })
  it('stays segmented exactly at the segment ceiling', () => {
    expect(seatSegments(24, 10).mode).toBe('segmented')
  })
  it('switches to continuous one seat past the ceiling', () => {
    expect(seatSegments(25, 10).mode).toBe('continuous')
  })
})

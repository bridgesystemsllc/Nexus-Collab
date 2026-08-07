import { describe, it, expect } from 'vitest'
import { weeklyPeriod, monthlyPeriod } from './schedule'
import { partsInZone, PROJECT_TZ } from '../cadence'

// The scheduled reports live or die on their period boundaries. Two runs of the
// same weekly job must produce the same period, or the idempotency check misses
// and everyone gets the digest twice. And the boundaries are ET calendar days,
// not rolling 24-hour windows — a report labelled "Jul 27 – Aug 3" must not
// actually start at 8pm on the 26th because the server is in UTC.

const etDay = (d: Date) => {
  const p = partsInZone(d, PROJECT_TZ)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
const etHour = (d: Date) => partsInZone(d, PROJECT_TZ).hour

describe('weeklyPeriod', () => {
  it('ends at ET midnight today and covers the seven preceding days', () => {
    // Monday 2026-08-03, 07:00 ET = 11:00 UTC (EDT, UTC-4).
    const now = new Date('2026-08-03T11:00:00.000Z')
    const { start, end } = weeklyPeriod(now)

    expect(etDay(end)).toBe('2026-08-03')
    expect(etHour(end)).toBe(0)
    expect(etDay(start)).toBe('2026-07-27')
    expect(etHour(start)).toBe(0)
  })

  it('is identical for every instant within the same ET day', () => {
    // 07:00 and 08:00 ET on the same Monday — the digest job and the status
    // update job. If these disagreed, the idempotency check would never match.
    const a = weeklyPeriod(new Date('2026-08-03T11:00:00.000Z'))
    const b = weeklyPeriod(new Date('2026-08-03T12:00:00.000Z'))
    expect(a.start.toISOString()).toBe(b.start.toISOString())
    expect(a.end.toISOString()).toBe(b.end.toISOString())
  })

  it('uses the ET calendar day, not the UTC one', () => {
    // 2026-08-03T02:00Z is still Sunday Aug 2 at 10pm in New York.
    const { end } = weeklyPeriod(new Date('2026-08-03T02:00:00.000Z'))
    expect(etDay(end)).toBe('2026-08-02')
  })

  it('spans exactly seven ET days across the spring DST change', () => {
    // DST starts Sunday 2026-03-08. The Monday after, the window reaches back
    // through it: 7 ET days is 167 real hours, not 168.
    const { start, end } = weeklyPeriod(new Date('2026-03-09T11:00:00.000Z'))
    expect(etDay(start)).toBe('2026-03-02')
    expect(etDay(end)).toBe('2026-03-09')
    expect(etHour(start)).toBe(0)
    expect(etHour(end)).toBe(0)
  })

  it('spans exactly seven ET days across the autumn DST change', () => {
    // DST ends Sunday 2026-11-01 — that week is 169 real hours.
    const { start, end } = weeklyPeriod(new Date('2026-11-02T12:00:00.000Z'))
    expect(etDay(start)).toBe('2026-10-26')
    expect(etDay(end)).toBe('2026-11-02')
    expect(etHour(start)).toBe(0)
    expect(etHour(end)).toBe(0)
  })
})

describe('monthlyPeriod', () => {
  it('covers the previous whole ET calendar month', () => {
    const { start, end } = monthlyPeriod(new Date('2026-08-01T12:00:00.000Z'))
    expect(etDay(start)).toBe('2026-07-01')
    expect(etDay(end)).toBe('2026-08-01')
    expect(etHour(start)).toBe(0)
    expect(etHour(end)).toBe(0)
  })

  it('rolls the year back at the January boundary', () => {
    const { start, end } = monthlyPeriod(new Date('2027-01-01T13:00:00.000Z'))
    expect(etDay(start)).toBe('2026-12-01')
    expect(etDay(end)).toBe('2027-01-01')
  })

  it('handles a February with 28 days without landing on the 29th', () => {
    const { start, end } = monthlyPeriod(new Date('2026-03-01T13:00:00.000Z'))
    expect(etDay(start)).toBe('2026-02-01')
    expect(etDay(end)).toBe('2026-03-01')
  })

  it('is identical for every instant on the 1st', () => {
    const a = monthlyPeriod(new Date('2026-09-01T12:00:00.000Z'))
    const b = monthlyPeriod(new Date('2026-09-01T20:00:00.000Z'))
    expect(a.start.toISOString()).toBe(b.start.toISOString())
    expect(a.end.toISOString()).toBe(b.end.toISOString())
  })

  it('does not read the UTC month when ET is still the previous one', () => {
    // 2026-09-01T02:00Z is 10pm on Aug 31 in New York — the report due on
    // Sep 1 has not come round yet, so the previous month is still July.
    const { start, end } = monthlyPeriod(new Date('2026-09-01T02:00:00.000Z'))
    expect(etDay(end)).toBe('2026-08-01')
    expect(etDay(start)).toBe('2026-07-01')
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildScale, addDays, daysBetween, startOfUTCDay, DAY_WIDTH,
} from './ganttScale'

const iso = (s: string) => s
const TODAY = new Date('2026-09-15T12:00:00Z')

describe('date helpers', () => {
  it('normalises to UTC midnight', () => {
    const d = startOfUTCDay('2026-09-15T23:45:00Z')
    expect(d.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('counts whole days between dates', () => {
    expect(daysBetween(new Date('2026-09-01'), new Date('2026-09-11'))).toBe(10)
    expect(daysBetween(new Date('2026-09-11'), new Date('2026-09-01'))).toBe(-10)
    expect(daysBetween(new Date('2026-09-01'), new Date('2026-09-01'))).toBe(0)
  })

  it('is immune to a time-of-day difference', () => {
    // Naive subtraction would give 0 here; the bar would lose a day.
    const a = new Date('2026-09-01T23:00:00Z')
    const b = new Date('2026-09-02T01:00:00Z')
    expect(daysBetween(a, b)).toBe(1)
  })

  it('crosses a month boundary correctly', () => {
    expect(daysBetween(new Date('2026-09-28'), new Date('2026-10-03'))).toBe(5)
  })

  it('crosses a DST boundary without gaining or losing a day', () => {
    // US DST ends 2026-11-01. Local-time maths would report 0.96 or 1.04 days.
    expect(daysBetween(new Date('2026-10-31T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))).toBe(2)
  })

  it('adds days across a year boundary', () => {
    expect(addDays(new Date('2026-12-30T00:00:00Z'), 5).toISOString().slice(0, 10)).toBe('2027-01-04')
  })
})

describe('buildScale — geometry', () => {
  const dates = [iso('2026-09-01'), iso('2026-09-30')]

  it('pads both ends so bars are not flush against the axis', () => {
    const s = buildScale(dates, 'week', TODAY)
    expect(s.start < startOfUTCDay('2026-09-01')).toBe(true)
    expect(s.end > startOfUTCDay('2026-09-30')).toBe(true)
  })

  it('scales width by the zoom level', () => {
    const week = buildScale(dates, 'week', TODAY)
    const quarter = buildScale(dates, 'quarter', TODAY)
    expect(week.dayWidth).toBe(DAY_WIDTH.week)
    expect(quarter.dayWidth).toBe(DAY_WIDTH.quarter)
    expect(week.width).toBeGreaterThan(quarter.width)
  })

  it('places a date at the expected pixel offset', () => {
    const s = buildScale(dates, 'week', TODAY)
    const x1 = s.xFor('2026-09-01')
    const x2 = s.xFor('2026-09-08')
    expect(x2 - x1).toBe(7 * DAY_WIDTH.week)
  })

  it('clamps a date outside the range instead of drawing off-canvas', () => {
    const s = buildScale(dates, 'week', TODAY)
    expect(s.xFor('2020-01-01')).toBe(0)
    expect(s.xFor('2030-01-01')).toBe(s.width)
  })

  it('returns 0 for a missing or unparseable date', () => {
    const s = buildScale(dates, 'week', TODAY)
    expect(s.xFor(null)).toBe(0)
    expect(s.xFor(undefined)).toBe(0)
    expect(s.xFor('not-a-date')).toBe(0)
  })
})

describe('buildScale — bar widths', () => {
  const s = buildScale([iso('2026-09-01'), iso('2026-09-30')], 'week', TODAY)

  it('measures a span in days', () => {
    expect(s.widthFor('2026-09-01', '2026-09-06')).toBe(5 * DAY_WIDTH.week)
  })

  it('gives a same-day task a visible one-day bar, never zero', () => {
    // A zero-width bar makes the task disappear from the schedule.
    expect(s.widthFor('2026-09-05', '2026-09-05')).toBe(DAY_WIDTH.week)
  })

  it('gives a one-day bar to a task with only one date', () => {
    expect(s.widthFor('2026-09-05', null)).toBe(DAY_WIDTH.week)
    expect(s.widthFor(null, '2026-09-05')).toBe(DAY_WIDTH.week)
  })

  it('returns zero only when both dates are missing', () => {
    expect(s.widthFor(null, null)).toBe(0)
  })

  it('never returns a negative width for inverted dates', () => {
    expect(s.widthFor('2026-09-20', '2026-09-10')).toBe(DAY_WIDTH.week)
  })
})

describe('buildScale — today line', () => {
  it('positions today when it falls inside the range', () => {
    const s = buildScale([iso('2026-09-01'), iso('2026-09-30')], 'week', TODAY)
    expect(s.todayX).not.toBeNull()
    expect(s.todayX).toBe(s.xFor('2026-09-15'))
  })

  it('reports null when today is outside the range, so no line is drawn', () => {
    const s = buildScale([iso('2020-01-01'), iso('2020-02-01')], 'week', TODAY)
    expect(s.todayX).toBeNull()
  })
})

describe('buildScale — empty projects', () => {
  it('produces a usable axis with no dates at all', () => {
    const s = buildScale([], 'week', TODAY)
    expect(s.width).toBeGreaterThan(0)
    expect(s.totalDays).toBeGreaterThan(0)
    expect(s.todayX).not.toBeNull()
  })

  it('ignores null entries mixed in with real dates', () => {
    const s = buildScale([null, iso('2026-09-01'), undefined, iso('2026-09-10')], 'week', TODAY)
    expect(s.width).toBeGreaterThan(0)
    expect(s.xFor('2026-09-10')).toBeGreaterThan(s.xFor('2026-09-01'))
  })
})

describe('buildScale — ticks', () => {
  it('emits weekly ticks at the week zoom', () => {
    const s = buildScale([iso('2026-09-01'), iso('2026-09-30')], 'week', TODAY)
    expect(s.ticks.length).toBeGreaterThan(3)
    // Every weekly tick lands on a Monday.
    expect(s.ticks.every((t) => t.date.getUTCDay() === 1)).toBe(true)
  })

  it('emits monthly ticks at the month zoom', () => {
    const s = buildScale([iso('2026-01-01'), iso('2026-12-31')], 'month', TODAY)
    expect(s.ticks.every((t) => t.date.getUTCDate() === 1)).toBe(true)
    expect(s.ticks.length).toBeGreaterThanOrEqual(11)
  })

  it('emits quarterly ticks at the quarter zoom', () => {
    const s = buildScale([iso('2026-01-01'), iso('2027-12-31')], 'quarter', TODAY)
    expect(s.ticks.every((t) => t.date.getUTCMonth() % 3 === 0)).toBe(true)
    expect(s.ticks.every((t) => /^Q[1-4] \d{4}$/.test(t.label))).toBe(true)
  })

  it('keeps every tick inside the chart width', () => {
    const s = buildScale([iso('2026-01-01'), iso('2026-12-31')], 'month', TODAY)
    expect(s.ticks.every((t) => t.x >= 0 && t.x <= s.width)).toBe(true)
  })
})

describe('daysForPixels — the inverse used while dragging', () => {
  it('round-trips a pixel delta back to days', () => {
    const s = buildScale([iso('2026-09-01'), iso('2026-09-30')], 'week', TODAY)
    expect(s.daysForPixels(DAY_WIDTH.week * 5)).toBe(5)
    expect(s.daysForPixels(-DAY_WIDTH.week * 3)).toBe(-3)
  })

  it('snaps a partial-day drag to the nearest whole day', () => {
    const s = buildScale([iso('2026-09-01'), iso('2026-09-30')], 'week', TODAY)
    expect(s.daysForPixels(DAY_WIDTH.week * 1.4)).toBe(1)
    expect(s.daysForPixels(DAY_WIDTH.week * 1.6)).toBe(2)
  })
})

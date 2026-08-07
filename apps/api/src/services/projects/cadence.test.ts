import { describe, it, expect } from 'vitest'
import {
  partsInZone, zonedWallClockToUtc, addZonedDays, nextCheckinAt,
  checkinDueAt, reminderStageFor, STAGE_RANK, formatEt,
  CHECKIN_HOUR_ET, PROJECT_TZ,
} from './cadence'

// 2026 US DST: begins Sun 8 March, ends Sun 1 November.
const EDT_DAY = new Date('2026-07-15T12:00:00Z') // summer, UTC-4
const EST_DAY = new Date('2026-12-15T12:00:00Z') // winter, UTC-5

describe('partsInZone', () => {
  it('renders an instant in Eastern time, not UTC', () => {
    // 12:00 UTC in July is 08:00 EDT.
    expect(partsInZone(EDT_DAY).hour).toBe(8)
    // 12:00 UTC in December is 07:00 EST.
    expect(partsInZone(EST_DAY).hour).toBe(7)
  })

  it('reports weekday as 1=Mon … 7=Sun', () => {
    // 2026-07-15 is a Wednesday.
    expect(partsInZone(EDT_DAY).weekday).toBe(3)
    // 2026-07-19 is a Sunday.
    expect(partsInZone(new Date('2026-07-19T16:00:00Z')).weekday).toBe(7)
  })

  it('reports the ET calendar date, which can differ from the UTC date', () => {
    // 02:00 UTC on the 16th is still 22:00 on the 15th in New York.
    const p = partsInZone(new Date('2026-07-16T02:00:00Z'))
    expect(p.day).toBe(15)
    expect(p.hour).toBe(22)
  })
})

describe('zonedWallClockToUtc', () => {
  it('resolves 9am ET in summer to 13:00 UTC (EDT, UTC-4)', () => {
    const d = zonedWallClockToUtc(2026, 7, 15, 9)
    expect(d.toISOString()).toBe('2026-07-15T13:00:00.000Z')
  })

  it('resolves 9am ET in winter to 14:00 UTC (EST, UTC-5)', () => {
    const d = zonedWallClockToUtc(2026, 12, 15, 9)
    expect(d.toISOString()).toBe('2026-12-15T14:00:00.000Z')
  })

  it('round-trips: the resolved instant renders back as the requested wall clock', () => {
    for (const [y, m, day] of [[2026, 3, 9], [2026, 11, 2], [2026, 1, 1], [2026, 6, 30]] as const) {
      const utc = zonedWallClockToUtc(y, m, day, CHECKIN_HOUR_ET)
      const p = partsInZone(utc)
      expect([p.year, p.month, p.day, p.hour]).toEqual([y, m, day, CHECKIN_HOUR_ET])
    }
  })

  it('handles the day DST begins', () => {
    // 8 March 2026: clocks jump 02:00 -> 03:00. 9am still exists.
    const utc = zonedWallClockToUtc(2026, 3, 8, 9)
    expect(partsInZone(utc).hour).toBe(9)
    expect(utc.toISOString()).toBe('2026-03-08T13:00:00.000Z')
  })

  it('handles the day DST ends', () => {
    // 1 November 2026: clocks fall back. 9am is unambiguous.
    const utc = zonedWallClockToUtc(2026, 11, 1, 9)
    expect(partsInZone(utc).hour).toBe(9)
    expect(utc.toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })
})

describe('addZonedDays', () => {
  it('preserves the local hour across a DST boundary', () => {
    // This is the whole point: naive +24h arithmetic would land at 8am or 10am.
    const before = zonedWallClockToUtc(2026, 10, 30, 9) // EDT
    const after = addZonedDays(before, 7)               // crosses 1 Nov into EST
    expect(partsInZone(after).hour).toBe(9)
    expect(partsInZone(after).day).toBe(6)
    expect(partsInZone(after).month).toBe(11)
  })

  it('preserves the local hour across the spring transition too', () => {
    const before = zonedWallClockToUtc(2026, 3, 5, 9)
    const after = addZonedDays(before, 7)
    expect(partsInZone(after).hour).toBe(9)
    expect(partsInZone(after).day).toBe(12)
  })

  it('crosses month and year boundaries', () => {
    const d = addZonedDays(zonedWallClockToUtc(2026, 12, 28, 9), 7)
    const p = partsInZone(d)
    expect([p.year, p.month, p.day]).toEqual([2027, 1, 4])
  })
})

describe('nextCheckinAt — cadences', () => {
  const from = zonedWallClockToUtc(2026, 7, 15, 9) // Wednesday

  it('opts out entirely for NONE', () => {
    expect(nextCheckinAt('NONE', null, from)).toBeNull()
  })

  it('DAILY advances one day and lands at 9am ET', () => {
    const next = nextCheckinAt('DAILY', null, from)!
    const p = partsInZone(next)
    expect([p.month, p.day, p.hour]).toEqual([7, 16, 9])
  })

  it('WEEKLY advances seven days when no weekday is set', () => {
    const next = nextCheckinAt('WEEKLY', null, from)!
    const p = partsInZone(next)
    expect([p.month, p.day]).toEqual([7, 22])
  })

  it('WEEKLY rolls forward to the requested weekday', () => {
    // From Wed 15 July, +7 = Wed 22. Asking for Friday (5) rolls to the 24th.
    const next = nextCheckinAt('WEEKLY', 5, from)!
    const p = partsInZone(next)
    expect(p.weekday).toBe(5)
    expect(p.day).toBe(24)
  })

  it('never shortens the interval below the cadence', () => {
    // Asking for Monday (1) from a Wednesday must NOT come back at day +5;
    // a weekly project would then be chased twice in five days.
    const next = nextCheckinAt('WEEKLY', 1, from)!
    const gapDays = Math.round((next.getTime() - from.getTime()) / 86_400_000)
    expect(gapDays).toBeGreaterThanOrEqual(7)
    expect(partsInZone(next).weekday).toBe(1)
  })

  it('BIWEEKLY advances fourteen days', () => {
    const next = nextCheckinAt('BIWEEKLY', null, from)!
    const gapDays = Math.round((next.getTime() - from.getTime()) / 86_400_000)
    expect(gapDays).toBe(14)
  })

  it('MONTHLY advances one calendar month', () => {
    const next = nextCheckinAt('MONTHLY', null, from)!
    const p = partsInZone(next)
    expect([p.month, p.day]).toEqual([8, 15])
  })

  it('MONTHLY clamps rather than skipping a short month', () => {
    // 31 January + 1 month must be 28 February, not 3 March.
    const jan31 = zonedWallClockToUtc(2026, 1, 31, 9)
    const p = partsInZone(nextCheckinAt('MONTHLY', null, jan31)!)
    expect([p.month, p.day]).toEqual([2, 28])
  })

  it('MONTHLY rolls the year over in December', () => {
    const dec = zonedWallClockToUtc(2026, 12, 10, 9)
    const p = partsInZone(nextCheckinAt('MONTHLY', null, dec)!)
    expect([p.year, p.month]).toEqual([2027, 1])
  })

  it('always lands at 9am ET regardless of the hour it was scheduled from', () => {
    const oddHour = zonedWallClockToUtc(2026, 7, 15, 17, 43)
    for (const c of ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const) {
      expect(partsInZone(nextCheckinAt(c, null, oddHour)!).hour).toBe(CHECKIN_HOUR_ET)
    }
  })

  it('stays at 9am ET when the cadence spans a DST change', () => {
    const beforeFall = zonedWallClockToUtc(2026, 10, 28, 9)
    expect(partsInZone(nextCheckinAt('WEEKLY', null, beforeFall)!).hour).toBe(9)
    const beforeSpring = zonedWallClockToUtc(2026, 3, 4, 9)
    expect(partsInZone(nextCheckinAt('WEEKLY', null, beforeSpring)!).hour).toBe(9)
  })

  it('ignores an out-of-range weekday rather than producing a wild date', () => {
    const a = nextCheckinAt('WEEKLY', 0, from)!
    const b = nextCheckinAt('WEEKLY', 99, from)!
    expect(partsInZone(a).day).toBe(22)
    expect(partsInZone(b).day).toBe(22)
  })
})

describe('checkinDueAt', () => {
  it('is 48 hours after the request', () => {
    const req = new Date('2026-07-15T13:00:00Z')
    expect(checkinDueAt(req).toISOString()).toBe('2026-07-17T13:00:00.000Z')
  })
})

describe('reminderStageFor — the chase ladder', () => {
  const due = new Date('2026-07-17T13:00:00Z')
  const at = (hoursFromDue: number) => new Date(due.getTime() + hoursFromDue * 3_600_000)

  it('does nothing while there is plenty of time', () => {
    expect(reminderStageFor(due, at(-47))).toBe('NONE')
    expect(reminderStageFor(due, at(-25))).toBe('NONE')
  })

  it('sends the 24-hour reminder inside the last day', () => {
    expect(reminderStageFor(due, at(-24))).toBe('REMIND_24H')
    expect(reminderStageFor(due, at(-5))).toBe('REMIND_24H')
  })

  it('sends the 4-hour reminder inside the last four hours', () => {
    expect(reminderStageFor(due, at(-4))).toBe('REMIND_4H')
    expect(reminderStageFor(due, at(-0.5))).toBe('REMIND_4H')
  })

  it('escalates to the PM once due', () => {
    expect(reminderStageFor(due, at(0))).toBe('OVERDUE_PM')
    expect(reminderStageFor(due, at(12))).toBe('OVERDUE_PM')
    expect(reminderStageFor(due, at(23.9))).toBe('OVERDUE_PM')
  })

  it('escalates to the sponsor 24 hours after that', () => {
    expect(reminderStageFor(due, at(24))).toBe('OVERDUE_SPONSOR')
    expect(reminderStageFor(due, at(100))).toBe('OVERDUE_SPONSOR')
  })

  it('reports only the most advanced stage', () => {
    // Two days late must not re-send a 24-hour reminder it long passed.
    expect(reminderStageFor(due, at(48))).toBe('OVERDUE_SPONSOR')
  })

  it('ranks stages so the engine can tell what it has already done', () => {
    expect(STAGE_RANK.NONE).toBeLessThan(STAGE_RANK.REMIND_24H)
    expect(STAGE_RANK.REMIND_24H).toBeLessThan(STAGE_RANK.REMIND_4H)
    expect(STAGE_RANK.REMIND_4H).toBeLessThan(STAGE_RANK.OVERDUE_PM)
    expect(STAGE_RANK.OVERDUE_PM).toBeLessThan(STAGE_RANK.OVERDUE_SPONSOR)
  })
})

describe('formatEt', () => {
  it('renders in Eastern time for notification copy', () => {
    const s = formatEt(new Date('2026-07-17T13:00:00Z'))
    expect(s).toContain('Jul 17')
    expect(s).toContain('9:00')
  })

  it('uses the project timezone constant', () => {
    expect(PROJECT_TZ).toBe('America/New_York')
  })
})

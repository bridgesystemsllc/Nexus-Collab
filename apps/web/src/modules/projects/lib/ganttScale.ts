// ─── Gantt time scale ────────────────────────────────────────
// Pure date↔pixel maths, kept out of the component so it can be tested
// directly. Every off-by-one here is a bar drawn in the wrong place, and those
// are invisible in code review but obvious to a user staring at a schedule.
//
// All arithmetic is done in UTC. Doing it in local time means a project viewed
// during a DST transition silently gains or loses a day of bar width.

export type ZoomLevel = 'week' | 'month' | 'quarter'

export const MS_PER_DAY = 86_400_000

/** Pixels per day at each zoom. Wider zoom = fewer pixels per day. */
export const DAY_WIDTH: Record<ZoomLevel, number> = {
  week: 28,
  month: 8,
  quarter: 3,
}

export function startOfUTCDay(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfUTCDay(b).getTime() - startOfUTCDay(a).getTime()) / MS_PER_DAY)
}

export interface GanttTick {
  date: Date
  label: string
  /** Major ticks get a heavier line and a bolder label (month/quarter starts). */
  major: boolean
  x: number
}

export interface GanttScale {
  start: Date
  end: Date
  dayWidth: number
  totalDays: number
  width: number
  /** X offset in pixels for a date, clamped to the chart. */
  xFor: (date: Date | string | null | undefined) => number
  /** Bar width in pixels for a date range; never below a visible minimum. */
  widthFor: (start: Date | string | null | undefined, end: Date | string | null | undefined) => number
  /** Inverse: how many days does a pixel delta represent? */
  daysForPixels: (px: number) => number
  ticks: GanttTick[]
  todayX: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Build the scale from the dates actually present on the project.
 *
 * A little padding is added on both sides so a bar starting on day one is not
 * flush against the axis, and so a milestone diamond on the final day is not
 * clipped in half.
 */
export function buildScale(
  dates: (Date | string | null | undefined)[],
  zoom: ZoomLevel,
  today = new Date(),
): GanttScale {
  const valid = dates
    .filter((d): d is Date | string => !!d)
    .map((d) => startOfUTCDay(d))
    .filter((d) => Number.isFinite(d.getTime()))

  // An empty or fully-undated project still needs a usable axis, so fall back
  // to a window around today rather than producing a zero-width chart.
  const fallbackStart = addDays(startOfUTCDay(today), -14)
  const min = valid.length ? new Date(Math.min(...valid.map((d) => d.getTime()))) : fallbackStart
  const max = valid.length ? new Date(Math.max(...valid.map((d) => d.getTime()))) : addDays(fallbackStart, 60)

  const padDays = zoom === 'week' ? 3 : zoom === 'month' ? 7 : 14
  const start = addDays(min, -padDays)
  const end = addDays(max, padDays)

  const dayWidth = DAY_WIDTH[zoom]
  const totalDays = Math.max(1, daysBetween(start, end))
  const width = totalDays * dayWidth

  const xFor = (date: Date | string | null | undefined): number => {
    if (!date) return 0
    const d = startOfUTCDay(date)
    if (!Number.isFinite(d.getTime())) return 0
    const x = daysBetween(start, d) * dayWidth
    return Math.max(0, Math.min(width, x))
  }

  const widthFor = (
    s: Date | string | null | undefined,
    e: Date | string | null | undefined,
  ): number => {
    if (!s && !e) return 0
    // A task with only one date still gets a one-day bar; drawing nothing
    // would make it vanish from the schedule entirely.
    const from = s ? startOfUTCDay(s) : startOfUTCDay(e as Date)
    const to = e ? startOfUTCDay(e) : startOfUTCDay(s as Date)
    const days = Math.max(1, daysBetween(from, to))
    return Math.max(dayWidth, days * dayWidth)
  }

  const todayUtc = startOfUTCDay(today)
  const todayInRange = todayUtc >= start && todayUtc <= end
  const todayX = todayInRange ? daysBetween(start, todayUtc) * dayWidth : null

  return {
    start, end, dayWidth, totalDays, width,
    xFor, widthFor,
    daysForPixels: (px: number) => Math.round(px / dayWidth),
    ticks: buildTicks(start, end, zoom, dayWidth),
    todayX,
  }
}

function buildTicks(start: Date, end: Date, zoom: ZoomLevel, dayWidth: number): GanttTick[] {
  const ticks: GanttTick[] = []
  const total = daysBetween(start, end)

  if (zoom === 'week') {
    // Weekly ticks on Mondays; the first of a month is major.
    let cursor = new Date(start)
    const dow = cursor.getUTCDay()
    // getUTCDay: 0=Sun. Advance to the next Monday.
    cursor = addDays(cursor, (8 - (dow === 0 ? 7 : dow)) % 7)
    while (daysBetween(start, cursor) <= total) {
      const major = cursor.getUTCDate() <= 7
      ticks.push({
        date: new Date(cursor),
        label: `${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCDate()}`,
        major,
        x: daysBetween(start, cursor) * dayWidth,
      })
      cursor = addDays(cursor, 7)
    }
    return ticks
  }

  if (zoom === 'month') {
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    if (cursor < start) cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    while (cursor <= end) {
      const major = cursor.getUTCMonth() % 3 === 0
      ticks.push({
        date: new Date(cursor),
        label: `${MONTHS[cursor.getUTCMonth()]}${major ? ` ${cursor.getUTCFullYear()}` : ''}`,
        major,
        x: daysBetween(start, cursor) * dayWidth,
      })
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
    return ticks
  }

  // Quarter: tick each quarter start.
  let q = Math.floor(start.getUTCMonth() / 3)
  let year = start.getUTCFullYear()
  let cursor = new Date(Date.UTC(year, q * 3, 1))
  if (cursor < start) {
    q += 1
    if (q > 3) { q = 0; year += 1 }
    cursor = new Date(Date.UTC(year, q * 3, 1))
  }
  while (cursor <= end) {
    ticks.push({
      date: new Date(cursor),
      label: `Q${Math.floor(cursor.getUTCMonth() / 3) + 1} ${cursor.getUTCFullYear()}`,
      major: cursor.getUTCMonth() === 0,
      x: daysBetween(start, cursor) * dayWidth,
    })
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1))
  }
  return ticks
}

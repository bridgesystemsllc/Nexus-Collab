// ─── Check-in cadence scheduling ─────────────────────────────
// All scheduling is anchored to America/New_York wall-clock time, not UTC.
// A "Monday 9am check-in" must land at 9am in the office, and the UTC instant
// that corresponds to differs by an hour depending on daylight saving. Doing
// this in UTC would drift the reminder an hour twice a year, which is exactly
// the sort of thing nobody notices until someone is chased at 5am.
//
// No date library is added: Intl already knows the zone rules, so the offset
// is derived from it rather than hardcoded.

export const PROJECT_TZ = 'America/New_York'

/** The hour (ET) a check-in is requested at. Start of the working day. */
export const CHECKIN_HOUR_ET = 9

export type Cadence = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'NONE'

export const CADENCE_DAYS: Record<Exclude<Cadence, 'NONE' | 'MONTHLY'>, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
}

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
  /** 1 = Monday … 7 = Sunday, matching the schema's checkinDayOfWeek. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
}

/** Break an instant into its wall-clock parts in the project timezone. */
export function partsInZone(instant: Date, timeZone = PROJECT_TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some environments; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 1,
  }
}

/**
 * The UTC instant at which the given wall clock occurs in the zone.
 *
 * Derived by guessing UTC, measuring how far the guess lands from the target
 * once rendered in the zone, and correcting. Two passes settle it even across
 * a DST transition, where the first correction can itself shift the offset.
 */
export function zonedWallClockToUtc(
  year: number, month: number, day: number,
  hour: number, minute = 0,
  timeZone = PROJECT_TZ,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

  for (let i = 0; i < 2; i++) {
    const p = partsInZone(guess, timeZone)
    const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0)
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0)
    const drift = wanted - rendered
    if (drift === 0) break
    guess = new Date(guess.getTime() + drift)
  }
  return guess
}

/** Add whole days in ET wall-clock terms, preserving the local hour. */
export function addZonedDays(instant: Date, days: number, timeZone = PROJECT_TZ): Date {
  const p = partsInZone(instant, timeZone)

  // Advance the CALENDAR date with plain UTC arithmetic — Date.UTC handles
  // month and year rollover — then resolve that wall clock in the zone.
  //
  // The target date's fields are read straight back off the UTC date, never
  // re-rendered through the timezone: midnight UTC renders as the previous
  // evening in New York, which would silently land the result a day early.
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedWallClockToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    p.hour,
    p.minute,
    timeZone,
  )
}

/**
 * When is the next check-in due to be REQUESTED?
 *
 * `from` is the moment we are scheduling relative to — usually the previous
 * request, or project approval for the first one. Returns null for NONE, which
 * is how a project opts out entirely.
 *
 * `dayOfWeek` (1=Mon … 7=Sun) applies to WEEKLY and BIWEEKLY: the cadence
 * lands on that weekday rather than an arbitrary day derived from whenever the
 * project happened to be created.
 */
export function nextCheckinAt(
  cadence: Cadence,
  dayOfWeek: number | null | undefined,
  from: Date,
  timeZone = PROJECT_TZ,
): Date | null {
  if (cadence === 'NONE') return null

  const p = partsInZone(from, timeZone)

  if (cadence === 'DAILY') {
    const next = addZonedDays(from, 1, timeZone)
    const np = partsInZone(next, timeZone)
    return zonedWallClockToUtc(np.year, np.month, np.day, CHECKIN_HOUR_ET, 0, timeZone)
  }

  if (cadence === 'MONTHLY') {
    // Same day-of-month next month. Clamped, so the 31st does not silently
    // skip a short month.
    const targetMonth = p.month === 12 ? 1 : p.month + 1
    const targetYear = p.month === 12 ? p.year + 1 : p.year
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
    const day = Math.min(p.day, lastDay)
    return zonedWallClockToUtc(targetYear, targetMonth, day, CHECKIN_HOUR_ET, 0, timeZone)
  }

  const span = CADENCE_DAYS[cadence]
  let candidate = addZonedDays(from, span, timeZone)

  if (dayOfWeek && dayOfWeek >= 1 && dayOfWeek <= 7) {
    // Roll forward to the requested weekday. Rolling forward rather than to
    // the nearest keeps the interval at or above the cadence, so a WEEKLY
    // project is never asked twice in four days.
    const cp = partsInZone(candidate, timeZone)
    const delta = (dayOfWeek - cp.weekday + 7) % 7
    if (delta > 0) candidate = addZonedDays(candidate, delta, timeZone)
  }

  const cp = partsInZone(candidate, timeZone)
  return zonedWallClockToUtc(cp.year, cp.month, cp.day, CHECKIN_HOUR_ET, 0, timeZone)
}

/** Check-ins are due 48 hours after they are requested. */
export const CHECKIN_WINDOW_HOURS = 48

export function checkinDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + CHECKIN_WINDOW_HOURS * 3_600_000)
}

// ─── Reminder / escalation thresholds ────────────────────────
// Expressed as hours relative to the due time: negative is before, positive
// after. Kept as data so the ladder is legible in one place rather than
// scattered through conditionals.
export const REMINDER_HOURS_BEFORE = [24, 4] as const
export const ESCALATE_TO_PM_HOURS_AFTER = 0
export const ESCALATE_TO_SPONSOR_HOURS_AFTER = 24

export type ReminderStage = 'NONE' | 'REMIND_24H' | 'REMIND_4H' | 'OVERDUE_PM' | 'OVERDUE_SPONSOR'

/**
 * Which stage of the chase ladder is a pending check-in in?
 *
 * Returns the single most advanced stage that applies, so a check-in that has
 * been ignored for two days escalates to the sponsor rather than re-sending a
 * 24-hour reminder it has long passed.
 */
export function reminderStageFor(dueAt: Date, now: Date): ReminderStage {
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3_600_000

  if (hoursUntilDue <= -ESCALATE_TO_SPONSOR_HOURS_AFTER) return 'OVERDUE_SPONSOR'
  if (hoursUntilDue <= ESCALATE_TO_PM_HOURS_AFTER) return 'OVERDUE_PM'
  if (hoursUntilDue <= 4) return 'REMIND_4H'
  if (hoursUntilDue <= 24) return 'REMIND_24H'
  return 'NONE'
}

/** Rank so the engine can tell whether a stage has already been actioned. */
export const STAGE_RANK: Record<ReminderStage, number> = {
  NONE: 0,
  REMIND_24H: 1,
  REMIND_4H: 2,
  OVERDUE_PM: 3,
  OVERDUE_SPONSOR: 4,
}

/** Human label for the ET date, used in notification copy. */
export function formatEt(instant: Date, timeZone = PROJECT_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(instant)
}

// ─── Health scoring ──────────────────────────────────────────
// Start at 100 and subtract. Pure computation so the arithmetic is testable
// and so the UI can show WHY a project is amber — a score with no breakdown
// tells an operator nothing they can act on, which is the whole point of
// having one.
//
// Each signal is individually capped so no single category can sink a project
// on its own: twelve overdue tasks is bad, but it should not outweigh every
// other dimension combined.

export type HealthBand = 'GREEN' | 'AMBER' | 'RED'

export interface HealthPenalty {
  code: string
  /** Human-readable, shown in the breakdown tooltip. */
  label: string
  /** Positive number of points removed. */
  points: number
  /** How many occurrences drove it, for "3 overdue milestones". */
  count?: number
  /** The cap that applied, when the raw total was clipped. */
  cappedAt?: number
}

export interface HealthInput {
  now: Date
  status: string
  overdueMilestones: number
  overdueTasks: number
  /** Tasks blocked for strictly more than five days. */
  longBlockedTasks: number
  /** Days the target end date sits past the baseline. Negative or 0 = no slip. */
  slipDays: number
  checkinOverdue: boolean
  lastActivityAt?: Date | null
  openCriticalRisks: number
  budgetAmount?: number | null
  actualSpend?: number | null
}

export interface HealthResult {
  score: number
  band: HealthBand
  penalties: HealthPenalty[]
}

const CAPS = {
  overdueMilestones: 30,
  overdueTasks: 20,
  longBlocked: 15,
  slip: 20,
  criticalRisks: 30,
} as const

function capped(raw: number, cap: number): { points: number; cappedAt?: number } {
  return raw > cap ? { points: cap, cappedAt: cap } : { points: raw }
}

export function bandFor(score: number): HealthBand {
  if (score >= 80) return 'GREEN'
  if (score >= 55) return 'AMBER'
  return 'RED'
}

export function computeHealth(input: HealthInput): HealthResult {
  const penalties: HealthPenalty[] = []

  if (input.overdueMilestones > 0) {
    const { points, cappedAt } = capped(input.overdueMilestones * 10, CAPS.overdueMilestones)
    penalties.push({
      code: 'OVERDUE_MILESTONES',
      label: `${input.overdueMilestones} overdue milestone${input.overdueMilestones === 1 ? '' : 's'}`,
      points, count: input.overdueMilestones, cappedAt,
    })
  }

  if (input.overdueTasks > 0) {
    const { points, cappedAt } = capped(input.overdueTasks * 3, CAPS.overdueTasks)
    penalties.push({
      code: 'OVERDUE_TASKS',
      label: `${input.overdueTasks} overdue task${input.overdueTasks === 1 ? '' : 's'}`,
      points, count: input.overdueTasks, cappedAt,
    })
  }

  if (input.longBlockedTasks > 0) {
    const { points, cappedAt } = capped(input.longBlockedTasks * 5, CAPS.longBlocked)
    penalties.push({
      code: 'LONG_BLOCKED',
      label: `${input.longBlockedTasks} task${input.longBlockedTasks === 1 ? '' : 's'} blocked over 5 days`,
      points, count: input.longBlockedTasks, cappedAt,
    })
  }

  if (input.slipDays > 0) {
    const { points, cappedAt } = capped(input.slipDays, CAPS.slip)
    penalties.push({
      code: 'SCHEDULE_SLIP',
      label: `Target end date is ${input.slipDays} day${input.slipDays === 1 ? '' : 's'} past baseline`,
      points, count: input.slipDays, cappedAt,
    })
  }

  if (input.checkinOverdue) {
    penalties.push({ code: 'CHECKIN_OVERDUE', label: 'Check-in is overdue', points: 10 })
  }

  // Silence is itself a signal: a project nobody has touched in two weeks is
  // not being run, whatever its task board says.
  const staleDays = input.lastActivityAt
    ? Math.floor((input.now.getTime() - input.lastActivityAt.getTime()) / 86_400_000)
    : null
  if (staleDays !== null && staleDays >= 14) {
    penalties.push({
      code: 'NO_ACTIVITY',
      label: `No activity for ${staleDays} days`,
      points: 10, count: staleDays,
    })
  }

  if (input.openCriticalRisks > 0) {
    const { points, cappedAt } = capped(input.openCriticalRisks * 15, CAPS.criticalRisks)
    penalties.push({
      code: 'CRITICAL_RISKS',
      label: `${input.openCriticalRisks} open critical risk${input.openCriticalRisks === 1 ? '' : 's'}`,
      points, count: input.openCriticalRisks, cappedAt,
    })
  }

  const budget = Number(input.budgetAmount)
  const spend = Number(input.actualSpend)
  if (Number.isFinite(budget) && budget > 0 && Number.isFinite(spend) && spend > budget * 1.1) {
    penalties.push({
      code: 'OVER_BUDGET',
      label: `Spend is ${Math.round((spend / budget) * 100)}% of budget`,
      points: 10,
    })
  }

  const deducted = penalties.reduce((acc, p) => acc + p.points, 0)
  const score = Math.max(0, Math.min(100, 100 - deducted))
  return { score, band: bandFor(score), penalties }
}

/**
 * Slip in days between a baseline and the current target.
 * Returns 0 when there is no baseline: slip is only meaningful against a plan
 * somebody committed to, and measuring against a draft would report movement
 * that nobody ever promised not to make.
 */
export function slipDaysBetween(
  baseline?: Date | null,
  target?: Date | null,
): number {
  if (!baseline || !target) return 0
  const days = Math.round((target.getTime() - baseline.getTime()) / 86_400_000)
  return days > 0 ? days : 0
}

/**
 * Should this status change be applied automatically?
 * A project falling to RED while ACTIVE is auto-flagged AT_RISK, because that
 * is a statement of fact. Recovery is never automatic — a human decides a
 * project is back on track, since the score can recover for reasons that do
 * not mean the underlying problem was solved (an overdue milestone being
 * pushed out, for example).
 */
export function autoStatusFor(
  currentStatus: string,
  previousBand: HealthBand,
  nextBand: HealthBand,
): string | null {
  if (nextBand === 'RED' && currentStatus === 'ACTIVE') return 'AT_RISK'
  // Deliberately no reverse transition.
  void previousBand
  return null
}

/** Did the band get worse? Drives notification, not recovery noise. */
export function bandWorsened(previous: HealthBand, next: HealthBand): boolean {
  const rank: Record<HealthBand, number> = { GREEN: 0, AMBER: 1, RED: 2 }
  return rank[next] > rank[previous]
}

// ─── Percent-complete rollup ─────────────────────────────────
// task -> phase -> project, as pure functions so the arithmetic is testable
// without a database.
//
// Two rules do the real work:
//  1. CANCELLED tasks leave the denominator entirely. A project that cancels
//     half its scope is not therefore 50% done — the cancelled work simply
//     stopped being part of the plan.
//  2. Weighting is by estimated hours where they exist. A 40-hour task and a
//     1-hour task are not each "half the phase", and equal weighting makes a
//     phase look nearly finished when only the trivia is done.

export interface RollupTask {
  id: string
  status: string
  percentComplete: number
  estimatedHours?: number | null
  phaseId?: string | null
}

export interface RollupPhase {
  id: string
  status?: string | null
}

/** A task's effective completion, ignoring whatever percent was typed in. */
export function effectiveTaskPercent(task: RollupTask): number {
  if (task.status === 'COMPLETE') return 100
  if (task.status === 'NOT_STARTED') return 0
  // CANCELLED is excluded upstream; if one reaches here it contributes nothing.
  if (task.status === 'CANCELLED') return 0
  const p = Number(task.percentComplete)
  if (!Number.isFinite(p)) return 0
  return Math.min(100, Math.max(0, Math.round(p)))
}

export function isCounted(task: RollupTask): boolean {
  return task.status !== 'CANCELLED'
}

/** Weight for the average. Falls back to equal weight when hours are unset. */
function weightOf(task: RollupTask): number {
  const h = Number(task.estimatedHours)
  return Number.isFinite(h) && h > 0 ? h : 1
}

/**
 * Weighted average completion across a set of tasks.
 * Returns 0 for an empty or fully-cancelled set rather than NaN — a phase with
 * nothing left in it is not complete, it is empty.
 */
export function rollupTasks(tasks: RollupTask[]): number {
  const counted = tasks.filter(isCounted)
  if (counted.length === 0) return 0

  // Mixed weighting is the trap: if some tasks have hours and others do not,
  // the unestimated ones would each count as a single hour and be drowned out
  // by a 40-hour neighbour. Only weight when every counted task is estimated.
  const allEstimated = counted.every((t) => {
    const h = Number(t.estimatedHours)
    return Number.isFinite(h) && h > 0
  })

  if (!allEstimated) {
    const sum = counted.reduce((acc, t) => acc + effectiveTaskPercent(t), 0)
    return round2(sum / counted.length)
  }

  const totalWeight = counted.reduce((acc, t) => acc + weightOf(t), 0)
  const weighted = counted.reduce((acc, t) => acc + effectiveTaskPercent(t) * weightOf(t), 0)
  return round2(weighted / totalWeight)
}

export interface PhaseRollup {
  phaseId: string
  percentComplete: number
  /** Total estimated hours in the phase; the project rollup weights by this. */
  weight: number
  taskCount: number
}

/** Per-phase completion, plus the weight each phase carries at project level. */
export function rollupPhases(phases: RollupPhase[], tasks: RollupTask[]): PhaseRollup[] {
  return phases.map((phase) => {
    const own = tasks.filter((t) => t.phaseId === phase.id)
    const counted = own.filter(isCounted)
    const weight = counted.reduce((acc, t) => acc + weightOf(t), 0)
    return {
      phaseId: phase.id,
      percentComplete: rollupTasks(own),
      weight: weight > 0 ? weight : counted.length,
      taskCount: counted.length,
    }
  })
}

export interface ProjectRollup {
  percentComplete: number
  phases: PhaseRollup[]
}

/**
 * Project completion. Weighted average of phases when phases exist, otherwise
 * a straight rollup of every task.
 *
 * Tasks that belong to no phase are deliberately included in the project total
 * even when phases exist — otherwise unphased work would be invisible to the
 * percentage and a project could read 100% with open tasks on the board.
 */
export function rollupProject(phases: RollupPhase[], tasks: RollupTask[]): ProjectRollup {
  const phaseRollups = rollupPhases(phases, tasks)

  if (phases.length === 0) {
    return { percentComplete: rollupTasks(tasks), phases: phaseRollups }
  }

  const phaseIds = new Set(phases.map((p) => p.id))
  const unphased = tasks.filter((t) => !t.phaseId || !phaseIds.has(t.phaseId))
  const unphasedCounted = unphased.filter(isCounted)

  const entries: { percent: number; weight: number }[] = phaseRollups
    .filter((p) => p.taskCount > 0)
    .map((p) => ({ percent: p.percentComplete, weight: p.weight }))

  if (unphasedCounted.length > 0) {
    entries.push({
      percent: rollupTasks(unphased),
      weight: unphasedCounted.reduce((acc, t) => acc + weightOf(t), 0),
    })
  }

  if (entries.length === 0) return { percentComplete: 0, phases: phaseRollups }

  const totalWeight = entries.reduce((a, e) => a + e.weight, 0)
  if (totalWeight === 0) {
    const avg = entries.reduce((a, e) => a + e.percent, 0) / entries.length
    return { percentComplete: round2(avg), phases: phaseRollups }
  }

  const weighted = entries.reduce((a, e) => a + e.percent * e.weight, 0)
  return { percentComplete: round2(weighted / totalWeight), phases: phaseRollups }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

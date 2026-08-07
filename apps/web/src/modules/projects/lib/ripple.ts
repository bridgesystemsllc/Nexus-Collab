import { addDays, daysBetween, startOfUTCDay } from './ganttScale'

// ─── Dependency ripple ───────────────────────────────────────
// When a task is dragged, its successors may no longer fit. This computes the
// full cascade BEFORE anything is written, so the user sees what a drag will
// actually do and can back out.
//
// Committing a drag and then discovering it moved eleven downstream tasks is
// the behaviour that makes people stop trusting a Gantt. The preview is the
// feature, not a nicety.
//
// Only forward pressure is modelled: pulling a task earlier never drags its
// successors earlier with it, because an earlier finish permits — but does not
// require — an earlier start. Pushing a task later does force successors out.

export interface RippleTask {
  id: string
  title: string
  taskNumber: number | null
  startDate: string | Date | null | undefined
  dueDate: string | Date | null | undefined
  departmentId?: string | null
}

export interface RippleEdge {
  predecessorId: string
  successorId: string
  dependencyType?: string
  lagDays?: number
}

export interface ShiftedTask {
  id: string
  title: string
  taskNumber: number | null
  fromStart: Date | null
  fromDue: Date | null
  toStart: Date | null
  toDue: Date | null
  shiftDays: number
  /** True for the task the user actually dragged. */
  isOrigin: boolean
}

export interface RippleResult {
  shifts: ShiftedTask[]
  /** Every task that moved except the dragged one. */
  affected: ShiftedTask[]
  /** True when a cycle was hit; the caller should refuse the drag. */
  aborted: boolean
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const d = startOfUTCDay(v)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Compute the cascade of a drag.
 *
 * @param tasks   every task on the project
 * @param edges   dependency edges
 * @param originId the dragged task
 * @param deltaDays how far it moved (negative = earlier)
 */
export function computeRipple(
  tasks: RippleTask[],
  edges: RippleEdge[],
  originId: string,
  deltaDays: number,
): RippleResult {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const origin = byId.get(originId)
  if (!origin || deltaDays === 0) return { shifts: [], affected: [], aborted: false }

  const successorsOf = new Map<string, RippleEdge[]>()
  for (const e of edges) {
    const list = successorsOf.get(e.predecessorId)
    if (list) list.push(e)
    else successorsOf.set(e.predecessorId, [e])
  }

  // Working dates, mutated as the cascade propagates.
  const start = new Map<string, Date | null>()
  const due = new Map<string, Date | null>()
  for (const t of tasks) {
    start.set(t.id, toDate(t.startDate))
    due.set(t.id, toDate(t.dueDate))
  }

  const originalStart = new Map(start)
  const originalDue = new Map(due)

  // Move the dragged task.
  const os = start.get(originId)
  const od = due.get(originId)
  if (os) start.set(originId, addDays(os, deltaDays))
  if (od) due.set(originId, addDays(od, deltaDays))

  // Breadth-first propagation. A visit counter guards against a cycle in
  // stored data: the server rejects cycles on write, but a corrupt graph must
  // not hang the browser.
  const queue: string[] = [originId]
  const visits = new Map<string, number>()
  const MAX_VISITS = 4
  let aborted = false

  while (queue.length > 0) {
    const currentId = queue.shift() as string
    const seen = (visits.get(currentId) ?? 0) + 1
    visits.set(currentId, seen)
    if (seen > MAX_VISITS) { aborted = true; break }

    const currentDue = due.get(currentId)
    if (!currentDue) continue

    for (const edge of successorsOf.get(currentId) ?? []) {
      const succ = byId.get(edge.successorId)
      if (!succ) continue

      const lag = edge.lagDays ?? 0
      // Finish-to-start is the only type the drag preview models. SS/FF/SF
      // exist in the schema but are not yet produced by any UI path, and
      // guessing at their semantics would show the user a wrong preview.
      if (edge.dependencyType && edge.dependencyType !== 'FS') continue

      const earliestStart = addDays(currentDue, lag)
      const succStart = start.get(succ.id)
      if (!succStart) continue

      // Only forward pressure: a successor already starting late enough stays
      // where it is.
      if (succStart >= earliestStart) continue

      const shift = daysBetween(succStart, earliestStart)
      if (shift <= 0) continue

      start.set(succ.id, addDays(succStart, shift))
      const succDue = due.get(succ.id)
      if (succDue) due.set(succ.id, addDays(succDue, shift))
      queue.push(succ.id)
    }
  }

  const shifts: ShiftedTask[] = []
  for (const t of tasks) {
    const fromS = originalStart.get(t.id) ?? null
    const fromD = originalDue.get(t.id) ?? null
    const toS = start.get(t.id) ?? null
    const toD = due.get(t.id) ?? null

    const movedStart = fromS && toS ? daysBetween(fromS, toS) : 0
    const movedDue = fromD && toD ? daysBetween(fromD, toD) : 0
    const shiftDays = movedStart || movedDue
    if (shiftDays === 0) continue

    shifts.push({
      id: t.id, title: t.title, taskNumber: t.taskNumber,
      fromStart: fromS, fromDue: fromD, toStart: toS, toDue: toD,
      shiftDays, isOrigin: t.id === originId,
    })
  }

  return { shifts, affected: shifts.filter((s) => !s.isOrigin), aborted }
}

/** One-line summary of a ripple, for the confirmation prompt. */
export function describeRipple(result: RippleResult): string {
  if (result.aborted) {
    return 'This dependency chain loops back on itself — the move was not applied.'
  }
  const n = result.affected.length
  if (n === 0) return 'No downstream tasks are affected.'
  const max = Math.max(...result.affected.map((a) => a.shiftDays))
  // Verb agreement is inverted relative to the noun: one task *shifts*, two
  // tasks *shift*.
  return (
    `${n} downstream task${n === 1 ? '' : 's'} ` +
    `${n === 1 ? 'shifts' : 'shift'} by up to ${max} day${max === 1 ? '' : 's'}.`
  )
}

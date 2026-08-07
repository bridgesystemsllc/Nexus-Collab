import type { Tx } from './numbering'

// ─── Dependency graph integrity ──────────────────────────────
// A cycle in task dependencies makes the critical-path pass non-terminating
// and the schedule meaningless. The database can only reject a self-edge via
// its CHECK constraint, so indirect cycles (A -> B -> C -> A) must be caught
// before the write.
//
// The check is a reachability question: adding predecessor -> successor
// creates a cycle exactly when `predecessor` is already reachable FROM
// `successor`. We walk forward from the successor looking for the
// predecessor, and return the offending chain so the API can name it.

export interface DependencyEdge {
  predecessorId: string
  successorId: string
}

export class DependencyCycleError extends Error {
  readonly status = 409
  /** The path that would close the loop, in order, e.g. [A, B, C, A]. */
  readonly chain: string[]

  constructor(chain: string[]) {
    super(`Dependency would create a cycle: ${chain.join(' -> ')}`)
    this.name = 'DependencyCycleError'
    this.chain = chain
  }
}

/** Adjacency list keyed by predecessor. */
export function buildGraph(edges: DependencyEdge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const e of edges) {
    const list = graph.get(e.predecessorId)
    if (list) list.push(e.successorId)
    else graph.set(e.predecessorId, [e.successorId])
  }
  return graph
}

/**
 * Would adding predecessorId -> successorId create a cycle?
 * Returns the closing chain if so, otherwise null.
 *
 * Iterative DFS with an explicit stack: a deep dependency chain should not be
 * able to blow the call stack, and the path is tracked so the caller can show
 * which chain is at fault rather than a bare "cycle detected".
 */
export function findCycle(
  edges: DependencyEdge[],
  predecessorId: string,
  successorId: string,
): string[] | null {
  // A task cannot depend on itself.
  if (predecessorId === successorId) return [predecessorId, successorId]

  const graph = buildGraph(edges)
  const visited = new Set<string>()
  // Stack of paths; each entry is the route taken from successorId.
  const stack: string[][] = [[successorId]]

  while (stack.length > 0) {
    const path = stack.pop() as string[]
    const node = path[path.length - 1] as string

    if (node === predecessorId) {
      // Reaching the predecessor from the successor means the new edge closes
      // a loop. Append the new edge's endpoint to show the full circuit.
      return [...path, successorId]
    }

    if (visited.has(node)) continue
    visited.add(node)

    for (const next of graph.get(node) ?? []) {
      if (!visited.has(next)) stack.push([...path, next])
    }
  }

  return null
}

/**
 * Load the project's existing dependency edges and reject the proposed one if
 * it would create a cycle. Scoped to a single project because dependencies
 * never cross project boundaries — this keeps the graph small enough to walk
 * in memory rather than issuing a recursive CTE per check.
 */
export async function assertNoCycle(
  tx: Tx,
  projectId: string,
  predecessorId: string,
  successorId: string,
): Promise<void> {
  const edges = await tx.taskDependency.findMany({
    where: {
      predecessor: { projectId, deletedAt: null },
      successor: { projectId, deletedAt: null },
    },
    select: { predecessorId: true, successorId: true },
  })

  const chain = findCycle(edges, predecessorId, successorId)
  if (chain) throw new DependencyCycleError(chain)
}

// ─── Critical path ───────────────────────────────────────────
// Forward/backward pass over the dependency graph. Tasks with zero total
// float are on the critical path. Duration is due - start in days, defaulting
// to 1 for tasks with no dates, so an unscheduled task still occupies the
// chain instead of collapsing it.

export interface SchedulableTask {
  id: string
  startDate?: Date | null
  dueDate?: Date | null
}

const MS_PER_DAY = 86_400_000

export function durationDays(task: SchedulableTask): number {
  if (!task.startDate || !task.dueDate) return 1
  const days = Math.round((task.dueDate.getTime() - task.startDate.getTime()) / MS_PER_DAY)
  return days > 0 ? days : 1
}

export interface CriticalPathResult {
  /** Task ids with zero total float. */
  criticalPath: Set<string>
  /** Total float per task, in days. */
  float: Map<string, number>
  /** Project duration along the longest chain, in days. */
  projectDuration: number
}

/**
 * Compute total float and the critical path.
 * Assumes an acyclic graph — assertNoCycle guarantees that on write, and a
 * cycle here would be a data-integrity bug rather than user input, so this
 * throws rather than looping forever.
 */
export function computeCriticalPath(
  tasks: SchedulableTask[],
  edges: DependencyEdge[],
): CriticalPathResult {
  const ids = tasks.map((t) => t.id)
  const duration = new Map(tasks.map((t) => [t.id, durationDays(t)]))
  const successors = buildGraph(edges)
  const predecessors = new Map<string, string[]>()
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]))

  for (const e of edges) {
    // Ignore edges pointing at tasks outside the supplied set (e.g. deleted).
    if (!duration.has(e.predecessorId) || !duration.has(e.successorId)) continue
    const list = predecessors.get(e.successorId)
    if (list) list.push(e.predecessorId)
    else predecessors.set(e.successorId, [e.predecessorId])
    indegree.set(e.successorId, (indegree.get(e.successorId) ?? 0) + 1)
  }

  // Topological order (Kahn).
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  const order: string[] = []
  const remaining = new Map(indegree)
  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(id)
    for (const next of successors.get(id) ?? []) {
      if (!duration.has(next)) continue
      const left = (remaining.get(next) ?? 0) - 1
      remaining.set(next, left)
      if (left === 0) queue.push(next)
    }
  }

  if (order.length !== ids.length) {
    throw new Error('Dependency graph contains a cycle; critical path cannot be computed')
  }

  // Forward pass: earliest start / earliest finish.
  const earlyStart = new Map<string, number>(ids.map((id) => [id, 0]))
  const earlyFinish = new Map<string, number>()
  for (const id of order) {
    const start = Math.max(
      0,
      ...(predecessors.get(id) ?? []).map((p) => earlyFinish.get(p) ?? 0),
    )
    earlyStart.set(id, start)
    earlyFinish.set(id, start + (duration.get(id) ?? 1))
  }

  const projectDuration = Math.max(0, ...ids.map((id) => earlyFinish.get(id) ?? 0))

  // Backward pass: latest finish / latest start.
  const lateFinish = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const succs = (successors.get(id) ?? []).filter((s) => duration.has(s))
    const finish = succs.length
      ? Math.min(...succs.map((s) => (lateFinish.get(s) ?? projectDuration) - (duration.get(s) ?? 1)))
      : projectDuration
    lateFinish.set(id, finish)
  }

  const float = new Map<string, number>()
  const criticalPath = new Set<string>()
  for (const id of ids) {
    const slack = (lateFinish.get(id) ?? 0) - (earlyFinish.get(id) ?? 0)
    float.set(id, slack)
    if (slack === 0) criticalPath.add(id)
  }

  return { criticalPath, float, projectDuration }
}

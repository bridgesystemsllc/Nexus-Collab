import type { Prisma, PrismaClient } from '@prisma/client'

// ─── Reference number allocation ─────────────────────────────
// Both project numbers and per-project task numbers are allocated from
// counters, never from MAX(...) + 1. Two concurrent creates would read the
// same maximum and both write the same number; the unique constraint would
// then reject one of them and the user would see a spurious failure.
//
// Counters are incremented with an atomic UPDATE ... SET n = n + 1 RETURNING,
// so concurrent callers serialise on the row and each receives a distinct
// value. Callers must pass the transaction client so allocation commits or
// rolls back with the row it names.

export type Tx = Prisma.TransactionClient | PrismaClient

export function formatProjectNumber(year: number, value: number): string {
  return `PRJ-${year}-${String(value).padStart(4, '0')}`
}

/**
 * How many taken numbers to step over before giving up. A seed or an import
 * introduces a contiguous block; an unbounded loop would spin forever against
 * a counter that had somehow been reset to zero on a large workspace.
 */
const MAX_SKIPS = 1000

/**
 * Allocate the next project number for an organization and year.
 *
 * Safe under concurrency: the increment is a single atomic statement, and the
 * create path tolerates a competing create via a unique-violation retry.
 *
 * Also skips numbers that are already taken. The counter is the source of
 * truth, but it is not the ONLY way a number gets used — a demo seed, a data
 * import, a restore, or a hand-written insert can all claim one without
 * telling the counter. When that happens the create fails on the unique
 * constraint and the user sees "Something went wrong" with no way to recover,
 * because every retry produces the same number. Stepping over taken numbers
 * makes the allocator self-correcting rather than permanently wedged.
 */
export async function allocateProjectNumber(
  tx: Tx,
  orgId: string,
  year = new Date().getFullYear(),
): Promise<string> {
  let candidate = await nextFromCounter(tx, orgId, year)

  for (let skipped = 0; skipped < MAX_SKIPS; skipped++) {
    const taken = await tx.project.findFirst({
      where: { projectNumber: candidate },
      select: { id: true },
    })
    if (!taken) return candidate

    // Someone claimed this number without going through the counter. Advance
    // and try the next one; the counter catches up as a side effect.
    candidate = await nextFromCounter(tx, orgId, year)
  }

  throw new Error(
    `Could not allocate a project number for ${orgId}/${year}: ` +
      `${MAX_SKIPS} consecutive numbers are already in use. The counter is likely out of sync.`,
  )
}

/** One atomic increment, returning the formatted number it yielded. */
async function nextFromCounter(tx: Tx, orgId: string, year: number): Promise<string> {
  // Fast path: the counter already exists for this org/year.
  const updated = await tx.projectNumberCounter.updateMany({
    where: { orgId, year },
    data: { lastValue: { increment: 1 } },
  })

  if (updated.count > 0) {
    const row = await tx.projectNumberCounter.findUnique({
      where: { orgId_year: { orgId, year } },
    })
    // The row cannot vanish between the update and this read inside a
    // transaction, but fail loudly rather than emit PRJ-YYYY-NaN if it does.
    if (!row) throw new Error(`Project counter for ${orgId}/${year} disappeared mid-allocation`)
    return formatProjectNumber(year, row.lastValue)
  }

  // First project of the year for this org.
  try {
    const created = await tx.projectNumberCounter.create({
      data: { orgId, year, lastValue: 1 },
    })
    return formatProjectNumber(year, created.lastValue)
  } catch (err: any) {
    // A concurrent caller created the counter between our updateMany and this
    // create. Retry the increment path — it must succeed now.
    if (err?.code !== 'P2002') throw err
    const retried = await tx.projectNumberCounter.update({
      where: { orgId_year: { orgId, year } },
      data: { lastValue: { increment: 1 } },
    })
    return formatProjectNumber(year, retried.lastValue)
  }
}

/**
 * Allocate the next task number within a project. Uses the counter on the
 * project row so numbers are monotonic and never reused — a deleted #4 leaves
 * a gap instead of being handed to a different task later, which would make
 * historical references ("see task #4") silently wrong.
 */
export async function allocateTaskNumber(tx: Tx, projectId: string): Promise<number> {
  const project = await tx.project.update({
    where: { id: projectId },
    data: { taskCounter: { increment: 1 } },
    select: { taskCounter: true },
  })
  return project.taskCounter
}

/**
 * Allocate a contiguous block of task numbers in one statement, for template
 * application and bulk create. Returns the numbers in order.
 */
export async function allocateTaskNumbers(
  tx: Tx,
  projectId: string,
  count: number,
): Promise<number[]> {
  if (count <= 0) return []
  const project = await tx.project.update({
    where: { id: projectId },
    data: { taskCounter: { increment: count } },
    select: { taskCounter: true },
  })
  const last = project.taskCounter
  const first = last - count + 1
  return Array.from({ length: count }, (_, i) => first + i)
}

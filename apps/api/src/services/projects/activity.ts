import type { Tx } from './numbering'

// ─── Project activity feed ───────────────────────────────────
// Every meaningful change writes one row. Engine actions pass actorId = null,
// which is why this table exists separately from Activity (whose author is
// non-null).
//
// Logging must never take down the operation it describes: a failed feed write
// is reported to the console and swallowed, because losing an audit line is
// strictly better than rolling back the user's actual change. Callers inside a
// transaction should pass the transaction client so the line commits with it.

export type EntityType =
  | 'PROJECT' | 'TASK' | 'MILESTONE' | 'PHASE' | 'CHECKIN' | 'RISK' | 'COLLAB' | 'REPORT'

export interface FieldChange {
  from: unknown
  to: unknown
}

export interface LogActivityInput {
  projectId: string
  actorId?: string | null
  departmentId?: string | null
  entityType: EntityType
  entityId?: string | null
  action: string
  summary: string
  fieldChanges?: Record<string, FieldChange> | null
}

export async function logActivity(tx: Tx, input: LogActivityInput): Promise<void> {
  try {
    await tx.projectActivity.create({
      data: {
        projectId: input.projectId,
        actorId: input.actorId ?? null,
        departmentId: input.departmentId ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        summary: input.summary,
        fieldChanges: (input.fieldChanges ?? undefined) as object | undefined,
      },
    })
  } catch (err) {
    console.error(
      `[projects] activity log failed for project ${input.projectId} (${input.action}):`,
      err,
    )
  }
}

/**
 * Diff two records down to the fields that actually changed, for the
 * fieldChanges column. Only compares the keys present in `next`, so a partial
 * PATCH does not report every untouched column as unchanged noise.
 */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  ignore: string[] = ['updatedAt'],
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {}
  for (const [key, to] of Object.entries(next)) {
    if (ignore.includes(key)) continue
    if (to === undefined) continue
    const from = prev[key]
    if (equalish(from, to)) continue
    changes[key] = { from: normalize(from), to: normalize(to) }
  }
  return changes
}

// Dates arrive as Date objects from Prisma but as ISO strings from a request
// body, and arrays are compared by content. Without this, every PATCH would
// report unchanged dates and tags as changes.
function equalish(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(a as string).getTime()
    const bt = b instanceof Date ? b.getTime() : new Date(b as string).getTime()
    return Number.isFinite(at) && Number.isFinite(bt) && at === bt
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => equalish(v, b[i]))
  }
  if (a == null && b == null) return true
  // Prisma Decimal and other objects with a comparable string form.
  if (typeof a === 'object' && a !== null && typeof (a as any).toString === 'function') {
    if (typeof b === 'number' || typeof b === 'string') return String(a) === String(b)
  }
  return false
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null && 'toNumber' in (value as any)) {
    return (value as any).toNumber()
  }
  return value
}

/** Touch the project's activity timestamp; the health score penalises silence. */
export async function touchProject(tx: Tx, projectId: string): Promise<void> {
  try {
    await tx.project.update({
      where: { id: projectId },
      data: { lastActivityAt: new Date() },
    })
  } catch (err) {
    console.error(`[projects] failed to touch lastActivityAt for ${projectId}:`, err)
  }
}

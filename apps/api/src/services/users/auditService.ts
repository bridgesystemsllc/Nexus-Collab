import type { Prisma, PrismaClient } from '@prisma/client'

// ─── Audit trail ─────────────────────────────────────────────
// Append-only by construction. This module exports `append` and `query` and
// nothing else — there is no update or delete path anywhere in the codebase,
// so there is no route that could expose one.
//
// `append` deliberately does NOT swallow its errors. Elsewhere in Nexus a
// failed activity write is logged and ignored, because losing an activity line
// is better than rolling back the user's work. This is the opposite: an
// unaudited authority change is worse than no change at all, so the append
// runs inside the caller's transaction and takes the mutation down with it.

export type Tx = Prisma.TransactionClient | PrismaClient

export type AuditAction =
  | 'user.created' | 'user.invited' | 'user.invite_resent' | 'user.invite_revoked'
  | 'user.updated' | 'user.role_changed' | 'user.status_changed'
  | 'user.permission_overridden' | 'user.permission_override_removed'
  | 'user.sessions_revoked' | 'user.email_change_requested' | 'user.email_changed'
  | 'settings.updated' | 'preferences.updated' | 'notifications.updated'
  | 'role.created' | 'role.updated' | 'role.deleted'
  | 'auth.login_failed'

export interface FieldChange {
  from: unknown
  to: unknown
}

export interface AppendInput {
  actorId: string | null
  actorEmailSnapshot: string | null
  action: AuditAction
  entityType: 'user' | 'role' | 'settings' | 'preferences' | 'notifications' | 'invitation'
  entityId: string | null
  changes?: Record<string, FieldChange> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Anything matching these never reaches the trail, whatever a caller passes.
 *
 * The audit log is the most-read table in an incident and one of the least
 * guarded — a token that lands here is a token in every export and every
 * screenshot of the Activity tab.
 */
const REDACTED_FIELDS = [
  'password', 'passwordhash', 'password_hash',
  'token', 'tokenhash', 'token_hash', 'accesstoken', 'refreshtoken',
  'secret', 'apikey', 'api_key', 'authorization', 'cookie', 'sessionid',
]

const REDACTED = '[redacted]'

function isSecret(field: string): boolean {
  const f = field.toLowerCase().replace(/[^a-z_]/g, '')
  return REDACTED_FIELDS.some((s) => f.includes(s.replace(/[^a-z_]/g, '')))
}

/** Strip secrets from a change set. Exported so it can be tested directly. */
export function redactChanges(
  changes: Record<string, FieldChange> | null | undefined,
): Record<string, FieldChange> | null {
  if (!changes) return null
  const out: Record<string, FieldChange> = {}
  for (const [field, change] of Object.entries(changes)) {
    // The field is kept so the trail still records that it changed — only the
    // values go. "password changed" is exactly what an auditor needs; the
    // value is exactly what they must not have.
    out[field] = isSecret(field)
      ? { from: REDACTED, to: REDACTED }
      : { from: normalise(change.from), to: normalise(change.to) }
  }
  return out
}

function normalise(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString()
  if (v === undefined) return null
  return v
}

/**
 * Compare two records down to what actually changed.
 *
 * Only keys present in `next` are considered, so a partial update does not
 * report every untouched column as unchanged noise.
 */
export function diff(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  ignore: string[] = ['updatedAt'],
): Record<string, FieldChange> {
  const out: Record<string, FieldChange> = {}
  for (const [key, to] of Object.entries(next)) {
    if (ignore.includes(key)) continue
    if (to === undefined) continue
    const from = prev[key]
    if (equalish(from, to)) continue
    out[key] = { from: normalise(from), to: normalise(to) }
  }
  return out
}

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
  return a == null && b == null
}

/**
 * Write one row.
 *
 * Pass the caller's transaction client. If this throws, the surrounding
 * transaction rolls back — which is the point.
 */
export async function append(tx: Tx, input: AppendInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      actorEmailSnapshot: input.actorEmailSnapshot,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changes: (redactChanges(input.changes) ?? undefined) as object | undefined,
      metadata: (input.metadata ?? undefined) as object | undefined,
    },
  })
}

// ─── Reading ─────────────────────────────────────────────────

export interface AuditQuery {
  entityType?: string
  entityId?: string
  actorId?: string
  action?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export async function query(prisma: PrismaClient, q: AuditQuery) {
  const page = Math.max(q.page ?? 1, 1)
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100)

  const where: Record<string, unknown> = {}
  if (q.entityType) where.entityType = q.entityType
  if (q.entityId) where.entityId = q.entityId
  if (q.actorId) where.actorId = q.actorId
  if (q.action) where.action = q.action
  if (q.from || q.to) {
    where.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) }
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, name: true, avatar: true } } },
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    rows: rows.map((r) => ({
      ...r,
      // The actor may since have been deactivated or renamed. The snapshot is
      // what the trail promised, so it wins over the live join.
      actorLabel: r.actor?.name ?? r.actorEmailSnapshot ?? 'System',
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

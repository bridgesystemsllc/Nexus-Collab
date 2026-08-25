// ─── Permission resolution ───────────────────────────────────
// The single place any question of "may this person do this" is answered.
// No route, service or component may inline its own version — a second copy
// is how two answers to the same question start to disagree.
//
// The rule, in full:
//
//   effective = permissions granted by the role
//             + overrides with effect 'grant', not expired
//             - overrides with effect 'deny',  not expired
//
//   DENY ALWAYS WINS.
//
// Split into pure functions over plain data, with the loading underneath, so
// the arithmetic can be tested exhaustively without a database.

export type PermissionKey = string

export type Effect = 'grant' | 'deny'

export interface ResolvedOverride {
  permissionKey: PermissionKey
  effect: Effect
  /// null means it never expires.
  expiresAt: Date | null
  reason?: string
}

export interface ResolvedRole {
  id: string
  key: string
  name: string
  /// Lower is more powerful. Owner is 0.
  rank: number
  permissions: PermissionKey[]
}

export type LifecycleStatus = 'invited' | 'active' | 'suspended' | 'deactivated'

export interface RbacSubject {
  id: string
  email?: string
  lifecycleStatus: LifecycleStatus | string
  role: ResolvedRole | null
  overrides: ResolvedOverride[]
}

/** Where a permission came from — the Permissions tab renders this verbatim. */
export interface PermissionSource {
  key: PermissionKey
  source: 'role' | 'override'
  /// Present only for overrides, so the UI can explain why on hover.
  reason?: string
  expiresAt?: Date | null
}

/**
 * Only an active account carries permissions.
 *
 * A suspended or deactivated member may still hold a live session cookie for a
 * few seconds after the status change, and an invited one has not accepted
 * yet. Gating here means every downstream check inherits the rule rather than
 * each remembering it.
 */
export function isActive(subject: Pick<RbacSubject, 'lifecycleStatus'>): boolean {
  return subject.lifecycleStatus === 'active'
}

function isLive(o: ResolvedOverride, now: Date): boolean {
  // An expired override is treated as absent, not as a deny. The nightly prune
  // is housekeeping; correctness cannot depend on it having run.
  return o.expiresAt === null || o.expiresAt > now
}

/**
 * Every permission the subject effectively holds, with where each came from.
 * Sorted so two calls with the same input produce the same output.
 */
export function effectivePermissions(subject: RbacSubject, now = new Date()): PermissionSource[] {
  if (!isActive(subject)) return []

  const live = subject.overrides.filter((o) => isLive(o, now))
  const denied = new Set(live.filter((o) => o.effect === 'deny').map((o) => o.permissionKey))

  const out = new Map<PermissionKey, PermissionSource>()

  for (const key of subject.role?.permissions ?? []) {
    if (denied.has(key)) continue
    out.set(key, { key, source: 'role' })
  }

  for (const o of live) {
    if (o.effect !== 'grant') continue
    // A grant cannot outrank a deny on the same key. Both present is a
    // contradiction the admin should resolve, and until they do the safer
    // reading wins.
    if (denied.has(o.permissionKey)) continue
    out.set(o.permissionKey, {
      key: o.permissionKey,
      source: 'override',
      reason: o.reason,
      expiresAt: o.expiresAt,
    })
  }

  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** The question every guard asks. */
export function can(subject: RbacSubject, permission: PermissionKey, now = new Date()): boolean {
  if (!isActive(subject)) return false

  const live = subject.overrides.filter((o) => isLive(o, now))

  // Deny first, and short-circuit. Checking the role grant first and then
  // subtracting would give the same answer but reads as if a grant could win.
  if (live.some((o) => o.effect === 'deny' && o.permissionKey === permission)) return false
  if (live.some((o) => o.effect === 'grant' && o.permissionKey === permission)) return true

  return (subject.role?.permissions ?? []).includes(permission)
}

export function canAll(subject: RbacSubject, permissions: PermissionKey[], now = new Date()): boolean {
  return permissions.every((p) => can(subject, p, now))
}

export function canAny(subject: RbacSubject, permissions: PermissionKey[], now = new Date()): boolean {
  return permissions.some((p) => can(subject, p, now))
}

// ─── Role assignment ─────────────────────────────────────────

export interface RankedRole {
  id: string
  key: string
  rank: number
}

export type AssignDecision =
  | { allowed: true }
  | { allowed: false; code: 'FORBIDDEN' | 'SELF_MODIFICATION_BLOCKED'; message: string }

/**
 * May `actor` put `target` into `role`?
 *
 * The rule is strict inequality on rank: you can only grant a role weaker than
 * your own. An admin cannot mint another owner, and — the case that is easy to
 * miss — cannot mint a second admin either, since that would let any admin
 * clone their own authority indefinitely.
 */
export function canAssignRole(
  actor: RbacSubject,
  target: { id: string },
  role: RankedRole,
): AssignDecision {
  if (!can(actor, 'roles:assign')) {
    return { allowed: false, code: 'FORBIDDEN', message: 'You cannot change roles.' }
  }

  // Changing your own role is refused outright rather than rank-checked: the
  // rank rule alone would happily let someone demote themselves out of the
  // last Owner seat.
  if (actor.id === target.id) {
    return {
      allowed: false,
      code: 'SELF_MODIFICATION_BLOCKED',
      message: 'You cannot change your own role. Ask another admin.',
    }
  }

  const actorRank = actor.role?.rank
  if (actorRank === undefined || actorRank === null) {
    return { allowed: false, code: 'FORBIDDEN', message: 'You have no role, so you cannot assign one.' }
  }

  if (role.rank <= actorRank) {
    return {
      allowed: false,
      code: 'FORBIDDEN',
      message: `You cannot grant a role at or above your own. Your role is ${actor.role?.name ?? 'unknown'}.`,
    }
  }

  return { allowed: true }
}

/** The roles an actor may hand out — what the role picker is allowed to show. */
export function assignableRoles<T extends RankedRole>(actor: RbacSubject, roles: T[]): T[] {
  if (!can(actor, 'roles:assign')) return []
  const actorRank = actor.role?.rank
  if (actorRank === undefined || actorRank === null) return []
  return roles.filter((r) => r.rank > actorRank).sort((a, b) => a.rank - b.rank)
}

// ─── Last Owner ──────────────────────────────────────────────

/**
 * Would this change leave the workspace with no active Owner?
 *
 * Called inside the same transaction as the write, with the count read in that
 * transaction — a check done beforehand races two admins demoting the last two
 * owners at once, and both would pass.
 */
export function wouldOrphanWorkspace(input: {
  /// Active owners counted inside the transaction, including the target.
  activeOwnerCount: number
  targetIsActiveOwner: boolean
  /// True when the change removes this person's owner status: a demotion, a
  /// suspension, or a deactivation.
  changeRemovesOwner: boolean
}): boolean {
  if (!input.targetIsActiveOwner || !input.changeRemovesOwner) return false
  return input.activeOwnerCount <= 1
}

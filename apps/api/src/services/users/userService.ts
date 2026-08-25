import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { append, diff, type Tx } from './auditService'
import { legacyRoleFor } from '../rbac/subject'
import { wouldOrphanWorkspace, type RbacSubject } from '../rbac/resolve'

// ─── User lifecycle ──────────────────────────────────────────
// Invite, edit, change role, change status.
//
// Every mutation here runs in one transaction that includes its audit write
// and, where relevant, its guard reads. That is not tidiness: the last-owner
// check and the count it depends on have to be in the same transaction as the
// write, or two admins demoting the last two owners simultaneously would both
// see a count of two and both succeed.

export class ServiceError extends Error {
  constructor(
    readonly code:
      | 'DUPLICATE_EMAIL' | 'NOT_FOUND' | 'FORBIDDEN' | 'LAST_OWNER_PROTECTED'
      | 'SELF_MODIFICATION_BLOCKED' | 'STALE_RESOURCE' | 'VALIDATION_FAILED' | 'INVITE_EXPIRED',
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = code
  }
}

export interface ActorContext {
  subject: RbacSubject
  ip?: string
  userAgent?: string
  requestId: string
}

const auditMeta = (ctx: ActorContext) => ({
  ip: ctx.ip ?? null,
  userAgent: ctx.userAgent ?? null,
  requestId: ctx.requestId,
})

// ─── Invitation tokens ───────────────────────────────────────

/** 32 bytes of CSPRNG. The raw value exists only in the email. */
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Constant-time comparison.
 *
 * Both sides are fixed-length hex digests, so lengths always match and the
 * only thing that varies is content — which is exactly what timingSafeEqual
 * is for.
 */
export function tokensMatch(rawCandidate: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(rawCandidate), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

// ─── Session revocation ──────────────────────────────────────

/**
 * Drop every session belonging to a member.
 *
 * connect-pg-simple keys sessions by `sess->>'userId'`, verified against a
 * live row rather than assumed. Runs inside the status-change transaction, so
 * a suspension cannot commit while leaving the sessions it was meant to end.
 */
export async function revokeSessions(tx: Tx, memberId: string): Promise<number> {
  const result = await tx.$executeRaw<number>`
    DELETE FROM "session" WHERE sess->>'userId' = ${memberId}
  `
  return Number(result ?? 0)
}

// ─── Duplicate email ─────────────────────────────────────────

export type EmailConflict =
  | { kind: 'none' }
  | { kind: 'active'; memberId: string }
  | { kind: 'deactivated'; memberId: string; name: string }
  | { kind: 'invited'; invitationId: string }

/**
 * Which of the three duplicate cases applies.
 *
 * Advisory only. The database's `lower(email)` unique index is the authority,
 * because a read-then-write check races two simultaneous invites — this exists
 * so the common case gets a useful answer instead of a constraint violation.
 */
export async function classifyEmail(prisma: PrismaClient, email: string): Promise<EmailConflict> {
  const normalised = email.trim().toLowerCase()

  const existing = await prisma.member.findFirst({
    where: { email: { equals: normalised, mode: 'insensitive' } },
    select: { id: true, name: true, lifecycleStatus: true },
  })
  if (existing) {
    return existing.lifecycleStatus === 'deactivated'
      ? { kind: 'deactivated', memberId: existing.id, name: existing.name }
      : { kind: 'active', memberId: existing.id }
  }

  const pending = await prisma.userInvitation.findFirst({
    where: {
      email: { equals: normalised, mode: 'insensitive' },
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  if (pending) return { kind: 'invited', invitationId: pending.id }

  return { kind: 'none' }
}

// ─── Invite ──────────────────────────────────────────────────

export interface InviteResult {
  invitation: { id: string; email: string; expiresAt: Date }
  /// Returned once, to the caller that will send the email. Never persisted.
  rawToken: string
  resent: boolean
}

const INVITE_TTL_DAYS = 7

export async function inviteUser(
  prisma: PrismaClient,
  ctx: ActorContext,
  input: {
    email: string
    firstName: string
    lastName: string
    roleId: string
    departmentId?: string | null
    message?: string
    orgId: string
  },
): Promise<InviteResult> {
  const conflict = await classifyEmail(prisma, input.email)

  if (conflict.kind === 'active') {
    throw new ServiceError('DUPLICATE_EMAIL', 'A user with this email already exists.', {
      fields: { email: 'A user with this email already exists.' },
    })
  }
  if (conflict.kind === 'deactivated') {
    // A dead end here is the difference between an admin reactivating someone
    // in one click and inventing a second address for them.
    throw new ServiceError('DUPLICATE_EMAIL', 'This person was deactivated. Reactivate them instead of inviting again.', {
      suggestion: 'reactivate',
      memberId: conflict.memberId,
      name: conflict.name,
      fields: { email: 'This person already has a deactivated account.' },
    })
  }

  const { raw, hash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
  const resent = conflict.kind === 'invited'

  const invitation = await prisma.$transaction(async (tx) => {
    // Re-inviting revokes the outstanding token rather than leaving two live.
    // Single-use means single-live.
    if (conflict.kind === 'invited') {
      await tx.userInvitation.update({
        where: { id: conflict.invitationId },
        data: { revokedAt: new Date() },
      })
    }

    const created = await tx.userInvitation.create({
      data: {
        email: input.email.trim().toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: input.roleId,
        departmentId: input.departmentId ?? null,
        message: input.message ?? null,
        tokenHash: hash,
        invitedById: ctx.subject.id,
        orgId: input.orgId,
        expiresAt,
      },
    })

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: resent ? 'user.invite_resent' : 'user.invited',
      entityType: 'invitation',
      entityId: created.id,
      // The token is not in `changes`, and redaction would strip it anyway.
      changes: { email: { from: null, to: created.email }, roleId: { from: null, to: input.roleId } },
      metadata: auditMeta(ctx),
    })

    return created
  })

  return {
    invitation: { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt },
    rawToken: raw,
    resent,
  }
}

// ─── Profile edit ────────────────────────────────────────────

export async function updateUser(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
  patch: Record<string, unknown>,
  opts: { expectedUpdatedAt?: Date } = {},
): Promise<{ id: string; updatedAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.member.findUnique({ where: { id: memberId } })
    if (!before) throw new ServiceError('NOT_FOUND', 'That user does not exist.')

    // Optimistic concurrency. Without it the second of two admins editing the
    // same profile silently overwrites the first, with no sign to either.
    if (opts.expectedUpdatedAt && before.updatedAt.getTime() !== opts.expectedUpdatedAt.getTime()) {
      throw new ServiceError('STALE_RESOURCE', 'Someone else changed this profile while you were editing. Reload and try again.', {
        currentUpdatedAt: before.updatedAt,
      })
    }

    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    if (Object.keys(data).length === 0) return { id: before.id, updatedAt: before.updatedAt }

    const after = await tx.member.update({ where: { id: memberId }, data })

    const changes = diff(before as unknown as Record<string, unknown>, data)
    if (Object.keys(changes).length > 0) {
      await append(tx, {
        actorId: ctx.subject.id,
        actorEmailSnapshot: ctx.subject.email ?? null,
        action: 'user.updated',
        entityType: 'user',
        entityId: memberId,
        changes,
        metadata: auditMeta(ctx),
      })
    }

    return { id: after.id, updatedAt: after.updatedAt }
  })
}

// ─── Role change ─────────────────────────────────────────────

export async function changeRole(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
  roleId: string,
  reason?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [target, nextRole, ownerRole] = await Promise.all([
      tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, role: true, roleId: true, lifecycleStatus: true, roleRef: { select: { key: true, name: true } } },
      }),
      tx.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, name: true, legacyRole: true } }),
      tx.role.findUnique({ where: { key: 'owner' }, select: { id: true } }),
    ])

    if (!target) throw new ServiceError('NOT_FOUND', 'That user does not exist.')
    // A nonexistent role must be a 422, not a foreign-key crash surfacing as a 500.
    if (!nextRole) throw new ServiceError('VALIDATION_FAILED', 'That role does not exist.', { fields: { roleId: 'Unknown role.' } })
    if (target.roleId === roleId) return

    // Counted inside the transaction, so two concurrent demotions cannot both
    // observe a safe number.
    if (ownerRole && target.roleId === ownerRole.id) {
      const activeOwners = await tx.member.count({
        where: { roleId: ownerRole.id, lifecycleStatus: 'active' },
      })
      if (wouldOrphanWorkspace({
        activeOwnerCount: activeOwners,
        targetIsActiveOwner: target.lifecycleStatus === 'active',
        changeRemovesOwner: roleId !== ownerRole.id,
      })) {
        throw new ServiceError('LAST_OWNER_PROTECTED', 'This is the last Owner. Make someone else an Owner first.')
      }
    }

    // Both columns move together. `Member.role` is what policy.ts and the task
    // routes still read; leaving it behind would mean someone's project access
    // silently disagreed with the role their profile shows.
    const legacy = await legacyRoleFor(tx as unknown as PrismaClient, roleId)
    await tx.member.update({ where: { id: memberId }, data: { roleId, role: legacy } })

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.role_changed',
      entityType: 'user',
      entityId: memberId,
      changes: {
        role: { from: target.roleRef?.name ?? target.role, to: nextRole.name },
        ...(reason ? { reason: { from: null, to: reason } } : {}),
      },
      metadata: auditMeta(ctx),
    })
  })
}

// ─── Status change ───────────────────────────────────────────

export async function changeStatus(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
  status: 'active' | 'suspended' | 'deactivated',
  reason: string,
): Promise<{ sessionsRevoked: number }> {
  // Refused before the transaction: an admin locking themselves out is never
  // what they meant, and there is no undo from the outside.
  if (memberId === ctx.subject.id && status !== 'active') {
    throw new ServiceError('SELF_MODIFICATION_BLOCKED', 'You cannot suspend or deactivate your own account.')
  }

  return prisma.$transaction(async (tx) => {
    const [target, ownerRole] = await Promise.all([
      tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, lifecycleStatus: true, roleId: true },
      }),
      tx.role.findUnique({ where: { key: 'owner' }, select: { id: true } }),
    ])
    if (!target) throw new ServiceError('NOT_FOUND', 'That user does not exist.')
    if (target.lifecycleStatus === status) return { sessionsRevoked: 0 }

    if (ownerRole && target.roleId === ownerRole.id) {
      const activeOwners = await tx.member.count({
        where: { roleId: ownerRole.id, lifecycleStatus: 'active' },
      })
      if (wouldOrphanWorkspace({
        activeOwnerCount: activeOwners,
        targetIsActiveOwner: target.lifecycleStatus === 'active',
        changeRemovesOwner: status !== 'active',
      })) {
        throw new ServiceError('LAST_OWNER_PROTECTED', 'This is the last Owner. Make someone else an Owner before suspending or deactivating them.')
      }
    }

    await tx.member.update({
      where: { id: memberId },
      data: {
        lifecycleStatus: status,
        deactivatedAt: status === 'deactivated' ? new Date() : null,
      },
    })

    // Same transaction as the status change. A suspension that commits while
    // the sessions survive is a suspension that did not happen.
    const sessionsRevoked = status === 'active' ? 0 : await revokeSessions(tx, memberId)

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.status_changed',
      entityType: 'user',
      entityId: memberId,
      changes: {
        lifecycleStatus: { from: target.lifecycleStatus, to: status },
        reason: { from: null, to: reason },
        ...(sessionsRevoked ? { sessionsRevoked: { from: null, to: sessionsRevoked } } : {}),
      },
      metadata: auditMeta(ctx),
    })

    return { sessionsRevoked }
  })
}

// ─── Permission overrides ────────────────────────────────────

export async function setOverride(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
  input: { permissionKey: string; effect: 'grant' | 'deny'; reason: string; expiresAt?: Date | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [target, permission] = await Promise.all([
      tx.member.findUnique({ where: { id: memberId }, select: { id: true } }),
      tx.permission.findUnique({ where: { key: input.permissionKey }, select: { key: true } }),
    ])
    if (!target) throw new ServiceError('NOT_FOUND', 'That user does not exist.')
    if (!permission) {
      throw new ServiceError('VALIDATION_FAILED', 'That permission does not exist.', {
        fields: { permissionKey: 'Unknown permission.' },
      })
    }

    const before = await tx.userPermissionOverride.findUnique({
      where: { memberId_permissionKey: { memberId, permissionKey: input.permissionKey } },
      select: { effect: true },
    })

    await tx.userPermissionOverride.upsert({
      where: { memberId_permissionKey: { memberId, permissionKey: input.permissionKey } },
      create: {
        memberId, permissionKey: input.permissionKey, effect: input.effect,
        reason: input.reason, expiresAt: input.expiresAt ?? null, grantedById: ctx.subject.id,
      },
      update: {
        effect: input.effect, reason: input.reason,
        expiresAt: input.expiresAt ?? null, grantedById: ctx.subject.id,
      },
    })

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.permission_overridden',
      entityType: 'user',
      entityId: memberId,
      changes: {
        [input.permissionKey]: { from: before?.effect ?? null, to: input.effect },
        reason: { from: null, to: input.reason },
      },
      metadata: auditMeta(ctx),
    })
  })
}

export async function removeOverride(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
  permissionKey: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.userPermissionOverride.findUnique({
      where: { memberId_permissionKey: { memberId, permissionKey } },
      select: { effect: true },
    })
    if (!existing) throw new ServiceError('NOT_FOUND', 'That override does not exist.')

    await tx.userPermissionOverride.delete({
      where: { memberId_permissionKey: { memberId, permissionKey } },
    })

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.permission_override_removed',
      entityType: 'user',
      entityId: memberId,
      changes: { [permissionKey]: { from: existing.effect, to: null } },
      metadata: auditMeta(ctx),
    })
  })
}

// ─── Force logout ────────────────────────────────────────────

export async function forceLogout(
  prisma: PrismaClient,
  ctx: ActorContext,
  memberId: string,
): Promise<{ sessionsRevoked: number }> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!target) throw new ServiceError('NOT_FOUND', 'That user does not exist.')

    const sessionsRevoked = await revokeSessions(tx, memberId)

    await append(tx, {
      actorId: ctx.subject.id,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.sessions_revoked',
      entityType: 'user',
      entityId: memberId,
      changes: { sessionsRevoked: { from: null, to: sessionsRevoked } },
      metadata: auditMeta(ctx),
    })

    return { sessionsRevoked }
  })
}

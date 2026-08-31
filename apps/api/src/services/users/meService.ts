import { randomBytes } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from '@nexus/shared'
import { append, diff } from './auditService'
import { ServiceError, hashToken, tokensMatch, revokeSessions, type ActorContext } from './userService'

// ─── Self-service ────────────────────────────────────────────
// What a signed-in person may change about themselves. Nothing here can alter
// authority: role, status and permissions are not parameters of any function
// in this file, so no combination of inputs reaches them.
//
// Every mutation writes its audit row inside the same transaction, on the same
// terms as the admin side — a settings change is still a change.

const auditMeta = (ctx: ActorContext) => ({
  ip: ctx.ip ?? null,
  userAgent: ctx.userAgent ?? null,
  requestId: ctx.requestId,
})

// ─── Notification defaults ───────────────────────────────────

/**
 * The matrix a member sees before they have ever touched it.
 *
 * Stored rows are the exception, not the rule: writing 24 rows per member at
 * signup would make the defaults impossible to change later without a
 * migration. Only what someone has actually overridden is persisted.
 */
export function defaultEnabled(channel: string, eventKey: string): boolean {
  // Digest is opt-in per event; the daily summary is the one thing in it by
  // default, otherwise a digest arrives repeating what was already emailed.
  if (channel === 'digest') return eventKey === 'weekly_summary'
  // In-app is on for everything: it costs nothing and is the channel people
  // expect to be complete.
  if (channel === 'in_app') return true
  // Email is reserved for things that need someone to act.
  return ['task_assigned', 'mention', 'approval_requested', 'task_overdue'].includes(eventKey)
}

export interface NotificationCell {
  channel: string
  eventKey: string
  enabled: boolean
  /// True when this cell is the default rather than a stored choice. The UI
  /// does not show it; it exists so "reset to defaults" can be exact.
  isDefault: boolean
}

export function buildMatrix(stored: { channel: string; eventKey: string; enabled: boolean }[]): NotificationCell[] {
  const byKey = new Map(stored.map((r) => [`${r.channel}:${r.eventKey}`, r.enabled]))
  const cells: NotificationCell[] = []
  for (const eventKey of NOTIFICATION_EVENTS) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const key = `${channel}:${eventKey}`
      const explicit = byKey.get(key)
      cells.push({
        channel,
        eventKey,
        enabled: explicit ?? defaultEnabled(channel, eventKey),
        isDefault: explicit === undefined,
      })
    }
  }
  return cells
}

// ─── Profile ─────────────────────────────────────────────────

export async function updateMe(
  prisma: PrismaClient,
  ctx: ActorContext,
  patch: Record<string, unknown>,
): Promise<{ id: string; updatedAt: Date }> {
  const memberId = ctx.subject.id

  return prisma.$transaction(async (tx) => {
    const before = await tx.member.findUnique({
      where: { id: memberId },
      select: {
        name: true, displayName: true, jobTitle: true, phone: true,
        timezone: true, locale: true, avatar: true,
      },
    })
    if (!before) throw new ServiceError('NOT_FOUND', 'Your account could not be found.')

    const changes = diff(before as Record<string, unknown>, patch)
    if (Object.keys(changes).length === 0) {
      const current = await tx.member.findUnique({ where: { id: memberId }, select: { updatedAt: true } })
      return { id: memberId, updatedAt: current!.updatedAt }
    }

    const updated = await tx.member.update({
      where: { id: memberId },
      data: patch,
      select: { id: true, updatedAt: true },
    })

    await append(tx, {
      actorId: memberId,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.updated',
      entityType: 'user',
      entityId: memberId,
      changes,
      metadata: { ...auditMeta(ctx), self: true },
    })

    return updated
  })
}

// ─── Preferences ─────────────────────────────────────────────

export async function updatePreferences(
  prisma: PrismaClient,
  ctx: ActorContext,
  patch: Record<string, unknown>,
) {
  const memberId = ctx.subject.id

  return prisma.$transaction(async (tx) => {
    const before = await tx.userPreference.findUnique({ where: { memberId } })

    // Quiet hours are a pair. Validating them here rather than in the schema
    // because a partial update can supply one half and inherit the other, and
    // the schema never sees the stored value.
    const start = 'quietHoursStart' in patch ? (patch.quietHoursStart as number | null) : before?.quietHoursStart ?? null
    const end = 'quietHoursEnd' in patch ? (patch.quietHoursEnd as number | null) : before?.quietHoursEnd ?? null
    if ((start === null) !== (end === null)) {
      throw new ServiceError('VALIDATION_FAILED', 'Quiet hours need both a start and an end.', {
        fields: { quietHoursEnd: 'Set both a start and an end, or neither.' },
      })
    }
    if (start !== null && end !== null && start === end) {
      throw new ServiceError('VALIDATION_FAILED', 'Quiet hours that start and end at the same minute cover nothing.', {
        fields: { quietHoursEnd: 'Choose a different end time.' },
      })
    }

    const saved = await tx.userPreference.upsert({
      where: { memberId },
      create: { memberId, ...patch },
      update: patch,
    })

    const changes = diff((before ?? {}) as Record<string, unknown>, patch)
    if (Object.keys(changes).length > 0) {
      await append(tx, {
        actorId: memberId,
        actorEmailSnapshot: ctx.subject.email ?? null,
        action: 'preferences.updated',
        entityType: 'preferences',
        entityId: memberId,
        changes,
        metadata: auditMeta(ctx),
      })
    }

    return saved
  })
}

// ─── Notifications ───────────────────────────────────────────

export async function updateNotifications(
  prisma: PrismaClient,
  ctx: ActorContext,
  entries: { channel: string; eventKey: string; enabled: boolean }[],
): Promise<NotificationCell[]> {
  const memberId = ctx.subject.id

  return prisma.$transaction(async (tx) => {
    const before = await tx.notificationPreference.findMany({ where: { memberId } })
    const beforeMap = new Map(before.map((r) => [`${r.channel}:${r.eventKey}`, r.enabled]))

    // Only cells that differ from the default are stored. A cell set back to
    // its default is deleted rather than written as an explicit copy, so
    // changing a default later actually reaches the people who never dissented.
    const toStore = entries.filter((e) => e.enabled !== defaultEnabled(e.channel, e.eventKey))
    const toClear = entries.filter((e) => e.enabled === defaultEnabled(e.channel, e.eventKey))

    for (const e of toStore) {
      await tx.notificationPreference.upsert({
        where: { memberId_channel_eventKey: { memberId, channel: e.channel, eventKey: e.eventKey } },
        create: { memberId, channel: e.channel, eventKey: e.eventKey, enabled: e.enabled },
        update: { enabled: e.enabled },
      })
    }
    if (toClear.length > 0) {
      await tx.notificationPreference.deleteMany({
        where: { memberId, OR: toClear.map((e) => ({ channel: e.channel, eventKey: e.eventKey })) },
      })
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const e of entries) {
      const key = `${e.channel}:${e.eventKey}`
      const was = beforeMap.get(key) ?? defaultEnabled(e.channel, e.eventKey)
      if (was !== e.enabled) changes[key] = { from: was, to: e.enabled }
    }

    if (Object.keys(changes).length > 0) {
      await append(tx, {
        actorId: memberId,
        actorEmailSnapshot: ctx.subject.email ?? null,
        action: 'notifications.updated',
        entityType: 'notifications',
        entityId: memberId,
        changes,
        metadata: auditMeta(ctx),
      })
    }

    const after = await tx.notificationPreference.findMany({ where: { memberId } })
    return buildMatrix(after)
  })
}

// ─── Sessions ────────────────────────────────────────────────

export interface SessionRow {
  id: string
  expiresAt: Date
  isCurrent: boolean
}

/**
 * The member's live sessions.
 *
 * Read from connect-pg-simple's table directly — it is not in the Prisma
 * schema, and adding it would put `prisma db push` in a position to drop it.
 */
export async function listSessions(
  prisma: PrismaClient,
  memberId: string,
  currentSid: string | null,
): Promise<SessionRow[]> {
  const rows = await prisma.$queryRaw<{ sid: string; expire: Date }[]>`
    SELECT sid, expire FROM "session"
    WHERE sess->>'userId' = ${memberId}
    ORDER BY expire DESC
  `
  return rows.map((r) => ({ id: r.sid, expiresAt: r.expire, isCurrent: r.sid === currentSid }))
}

/**
 * End every session except the one making the request.
 *
 * Keeping the current one is deliberate: signing the user out of the browser
 * they are actively using, in response to "sign out my other devices", reads
 * as a bug and costs them the page they were on.
 */
export async function signOutOtherSessions(
  prisma: PrismaClient,
  ctx: ActorContext,
  currentSid: string | null,
): Promise<{ revoked: number }> {
  const memberId = ctx.subject.id

  return prisma.$transaction(async (tx) => {
    const revoked = Number(
      await tx.$executeRaw`
        DELETE FROM "session"
        WHERE sess->>'userId' = ${memberId}
          AND sid IS DISTINCT FROM ${currentSid}
      `,
    )

    if (revoked > 0) {
      await append(tx, {
        actorId: memberId,
        actorEmailSnapshot: ctx.subject.email ?? null,
        action: 'user.sessions_revoked',
        entityType: 'user',
        entityId: memberId,
        changes: { sessionsRevoked: { from: null, to: revoked } },
        metadata: { ...auditMeta(ctx), self: true, keptCurrent: true },
      })
    }

    return { revoked }
  })
}

// ─── Email change ────────────────────────────────────────────

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000

export interface EmailChangeResult {
  /**
   * Returned once, for the message to the new address. Never persisted raw.
   *
   * Present whether or not the change can actually go through, and worthless
   * in the case where it cannot — the caller must not be able to tell the two
   * apart by looking at what it got back.
   */
  rawToken: string
  newEmail: string
  expiresAt: Date
  /// False when the address already belongs to someone. The only consumer is
  /// the mailer: nothing is sent, because sending would tell the other person.
  deliverable: boolean
}

/**
 * Start an email change.
 *
 * Nothing about the account moves yet. The address is parked in
 * `pendingEmail` and only promoted when someone proves they can read mail at
 * it — otherwise a typo, or a hijacked session, silently relocates the
 * account's identity.
 *
 * Deliberately indistinguishable from the outside whether the target address
 * already belongs to somebody: the caller gets the same shape either way, and
 * a taken address simply never produces a working token (§6.8).
 */
export async function requestEmailChange(
  prisma: PrismaClient,
  ctx: ActorContext,
  newEmail: string,
): Promise<EmailChangeResult> {
  const memberId = ctx.subject.id
  const normalised = newEmail.trim().toLowerCase()

  const current = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, orgId: true },
  })
  if (!current) throw new ServiceError('NOT_FOUND', 'Your account could not be found.')
  if (current.email.toLowerCase() === normalised) {
    throw new ServiceError('VALIDATION_FAILED', 'That is already your email address.', {
      fields: { newEmail: 'That is already your email address.' },
    })
  }

  // Scoped to the caller's own org: email is unique per organization
  // (@@unique([orgId, email])), not globally, so an address held by someone
  // in a different org is not "taken" from this member's point of view.
  // Unscoped, this was fail-closed rather than a leak — it refused an
  // address nobody in the caller's org actually holds — but still wrong.
  const taken = await prisma.member.findFirst({
    where: { orgId: current.orgId, email: { equals: normalised, mode: 'insensitive' }, NOT: { id: memberId } },
    select: { id: true },
  })

  const raw = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS)

  await prisma.$transaction(async (tx) => {
    // The address is recorded either way so the audit trail shows the attempt.
    // A taken address stores the hash of a DIFFERENT random value, so the
    // token handed back cannot verify — the refusal happens at confirmation
    // time, where it is indistinguishable from a bad or stale link.
    await tx.member.update({
      where: { id: memberId },
      data: {
        pendingEmail: normalised,
        pendingEmailTokenHash: hashToken(taken ? randomBytes(32).toString('base64url') : raw),
        pendingEmailExpiresAt: expiresAt,
      },
    })

    await append(tx, {
      actorId: memberId,
      actorEmailSnapshot: ctx.subject.email ?? null,
      action: 'user.email_change_requested',
      entityType: 'user',
      entityId: memberId,
      changes: { pendingEmail: { from: null, to: normalised } },
      metadata: { ...auditMeta(ctx), deliverable: !taken },
    })
  })

  return { rawToken: raw, newEmail: normalised, expiresAt, deliverable: !taken }
}

export async function verifyEmailChange(
  prisma: PrismaClient,
  ctx: ActorContext,
  rawToken: string,
): Promise<{ email: string }> {
  const memberId = ctx.subject.id

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: {
        email: true, pendingEmail: true,
        pendingEmailTokenHash: true, pendingEmailExpiresAt: true,
      },
    })
    if (!member?.pendingEmail || !member.pendingEmailTokenHash) {
      throw new ServiceError('NOT_FOUND', 'There is no email change waiting to be confirmed.')
    }
    if (!member.pendingEmailExpiresAt || member.pendingEmailExpiresAt.getTime() <= Date.now()) {
      throw new ServiceError('INVITE_EXPIRED', 'That confirmation link has expired. Start the change again.')
    }
    if (!tokensMatch(rawToken, member.pendingEmailTokenHash)) {
      throw new ServiceError('FORBIDDEN', 'That confirmation link is not valid.')
    }

    // Re-checked inside the transaction: the address may have been taken in
    // the day between requesting and confirming.
    const taken = await tx.member.findFirst({
      where: { email: { equals: member.pendingEmail, mode: 'insensitive' }, NOT: { id: memberId } },
      select: { id: true },
    })
    if (taken) {
      throw new ServiceError('DUPLICATE_EMAIL', 'That email address is now in use by someone else.')
    }

    await tx.member.update({
      where: { id: memberId },
      data: {
        email: member.pendingEmail,
        emailVerifiedAt: new Date(),
        pendingEmail: null,
        pendingEmailTokenHash: null,
        pendingEmailExpiresAt: null,
      },
    })

    await append(tx, {
      actorId: memberId,
      actorEmailSnapshot: member.email,
      action: 'user.email_changed',
      entityType: 'user',
      entityId: memberId,
      // The old address is the one worth keeping — it is how someone locked
      // out of the new one proves who they were.
      changes: { email: { from: member.email, to: member.pendingEmail } },
      metadata: auditMeta(ctx),
    })

    return { email: member.pendingEmail }
  })
}

export async function cancelEmailChange(prisma: PrismaClient, ctx: ActorContext): Promise<void> {
  await prisma.member.update({
    where: { id: ctx.subject.id },
    data: { pendingEmail: null, pendingEmailTokenHash: null, pendingEmailExpiresAt: null },
  })
}

/** Session revocation, re-exported so routes have one import for self-service. */
export { revokeSessions }

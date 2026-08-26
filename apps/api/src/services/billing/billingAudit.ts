import type { Request } from 'express'
import { append, type AuditAction, type Tx } from '../users/auditService'
import { requestIdOf } from '../../middleware/requirePermission'

// ─── Billing audit ───────────────────────────────────────────
// A thin shape over auditService so every billing mutation records the same
// things and nobody has to remember which. It is deliberately not a second
// audit system: entries land in the one append-only trail, which means they
// show up in Settings → Audit with no extra UI.
//
// Like auditService.append, this runs inside the caller's transaction and is
// allowed to fail it. An unaudited billing change is worse than no change.

export type BillingAuditAction = Extract<AuditAction, `billing.${string}`>

export interface BillingAuditInput {
  tx: Tx
  req: Request
  orgId: string
  action: BillingAuditAction
  entityType: 'subscription' | 'seat' | 'payment_method' | 'invoice'
  entityId: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function appendBillingAudit(input: BillingAuditInput): Promise<void> {
  const member = (input.req as any).member as { id: string; email: string } | undefined

  // before/after arrive as whole-state objects (what the spec calls
  // before_state/after_state); the trail stores per-field { from, to }, so
  // they are folded here rather than at every call site.
  const keys = new Set([...Object.keys(input.before ?? {}), ...Object.keys(input.after ?? {})])
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of keys) {
    const from = input.before?.[k]
    const to = input.after?.[k]
    if (from !== to) changes[k] = { from: from ?? null, to: to ?? null }
  }

  await append(input.tx, {
    actorId: member?.id ?? null,
    actorEmailSnapshot: member?.email ?? null,
    orgId: input.orgId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: Object.keys(changes).length ? changes : null,
    metadata: {
      ip: input.req.ip ?? null,
      userAgent: input.req.get('user-agent') ?? null,
      requestId: requestIdOf(input.req),
    },
  })
}

/**
 * The same, for a change Stripe made that no user initiated — a renewal, a
 * failed retry, a refund issued from the dashboard.
 *
 * actorId is null and actorType is carried in metadata, so the trail can still
 * answer "who did this" with "Stripe, on event evt_…" rather than a blank.
 */
export async function appendWebhookAudit(input: {
  tx: Tx
  orgId: string
  action: BillingAuditAction
  entityType: BillingAuditInput['entityType']
  entityId: string | null
  stripeEventId: string
  changes?: Record<string, { from: unknown; to: unknown }> | null
}): Promise<void> {
  await append(input.tx, {
    actorId: null,
    actorEmailSnapshot: null,
    orgId: input.orgId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: input.changes ?? null,
    metadata: { actorType: 'stripe_webhook', stripeEventId: input.stripeEventId },
  })
}

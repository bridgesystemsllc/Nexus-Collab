import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { Entitlements, FeatureKey } from '@nexus/shared'
import { prisma } from '../lib/prisma'
import { resolveEntitlements } from '../services/billing/entitlements'
import { requestIdOf } from './requirePermission'

// ─── Entitlement guards ──────────────────────────────────────
// The server-side half of the plan. The frontend gets entitlements so it can
// render an upgrade prompt instead of a broken button; these are what make
// flipping that client-side flag worth nothing.
//
// Same posture as requirePermission: every failure path refuses. A database
// error resolving entitlements produces a 500, never a pass.
//
// 402 Payment Required is used deliberately for both plan refusals. It is the
// one status that means "this is a billing problem, not a permission problem",
// which is what lets one client interceptor route these to the upgrade flow
// while leaving 403s alone.

export interface EntitledRequest extends Request {
  entitlements?: Entitlements
}

function billingError(
  res: Response, status: number, code: string, message: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(status).json({
    error: { code, message, ...extra, requestId: requestIdOf(res.req as Request) },
  })
}

/** Resolve once per request and memoise on it. */
async function load(req: EntitledRequest, res: Response): Promise<Entitlements | null> {
  if (req.entitlements) return req.entitlements

  const orgId = (req as any).member?.orgId
  if (typeof orgId !== 'string' || !orgId) {
    billingError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.')
    return null
  }

  try {
    const entitlements = await resolveEntitlements(prisma, orgId)
    req.entitlements = entitlements
    return entitlements
  } catch (err) {
    console.error('[billing] could not resolve entitlements:', err)
    // Fail closed. An outage must not become an open door to paid features.
    billingError(res, 500, 'INTERNAL', 'Something went wrong.')
    return null
  }
}

/** The plan must include this feature. */
export function requireFeature(feature: FeatureKey): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.features[feature]) return next()
    billingError(res, 402, 'PLAN_UPGRADE_REQUIRED',
      'Your plan does not include this feature.',
      { requiredFeature: feature, currentTier: e.tier })
  }
}

/** The subscription must currently permit writes. */
export function requireWriteAccess(): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.accessLevel === 'full') return next()
    billingError(res, 402,
      e.accessLevel === 'read_only' ? 'SUBSCRIPTION_READ_ONLY' : 'SUBSCRIPTION_INACTIVE',
      e.accessLevel === 'read_only'
        ? 'Your workspace is read-only until the outstanding invoice is paid.'
        : 'Your workspace does not have an active subscription.',
      { status: e.status, accessLevel: e.accessLevel })
  }
}

/**
 * At least one seat must be free.
 *
 * A guard, not the assignment path: the real check happens under a row lock in
 * seatManager (PR B7), because this reads a cache that may be up to 60s stale
 * and two concurrent adds could both pass it. This exists so the common case
 * gets a good error before doing any work.
 */
export function requireSeatAvailable(): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.limits.seats.available > 0) return next()
    billingError(res, 409, 'NO_SEATS_AVAILABLE',
      'Every purchased seat is assigned.',
      { seats: e.limits.seats, currentTier: e.tier })
  }
}
